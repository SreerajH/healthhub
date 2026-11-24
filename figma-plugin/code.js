// HealthHub Builder — local Figma development plugin.
// Runs in the Figma desktop app with the normal Plugin API, so it doesn't count
// against the Figma MCP tool-call limit.
// Plain ES2017: no optional chaining / nullish coalescing (plugin sandbox safety).
//
// A1 is READ-ONLY: it never changes the document. It sends a JSON report and a PNG of
// each screen to the local receiver (receiver.mjs, http://localhost:4201).

const ROOT_ID = '3164:61200';
const RECEIVER = 'http://localhost:4201';

// ---------- small helpers ----------

function hex2(n) { const s = Math.round(n * 255).toString(16); return s.length === 1 ? '0' + s : s; }
function toHex(c) { return ('#' + hex2(c.r) + hex2(c.g) + hex2(c.b)).toUpperCase(); }
function round(n, d) { const f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
function bbox(n) { return n.absoluteBoundingBox || n.absoluteRenderBounds || { x: 0, y: 0, width: 0, height: 0 }; }
function contains(b, p) { return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height; }
function center(n) { const b = bbox(n); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'screen'; }

function lum(c) {
  function ch(v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function blend(top, alpha, bottom) {
  return { r: top.r * alpha + bottom.r * (1 - alpha), g: top.g * alpha + bottom.g * (1 - alpha), b: top.b * alpha + bottom.b * (1 - alpha) };
}

// Topmost visible paint of a node: { kind: 'solid', color, alpha } | { kind: 'image' | 'gradient' } | null
function topPaint(n) {
  if (!('fills' in n) || !Array.isArray(n.fills)) return null;
  const fills = n.fills.filter(function (f) { return f.visible !== false; });
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i];
    const nodeOpacity = 'opacity' in n ? n.opacity : 1;
    if (f.type === 'SOLID') {
      const a = (f.opacity === undefined ? 1 : f.opacity) * nodeOpacity;
      if (a >= 0.5) return { kind: 'solid', color: f.color, alpha: a };
    } else if (f.type === 'IMAGE') return { kind: 'image' };
    else if (f.type.indexOf('GRADIENT') === 0) return { kind: 'gradient' };
  }
  return null;
}

// Deepest-topmost painted layer under point p inside node s (search children top→bottom first).
function paintAt(s, p) {
  if (s.visible === false) return null;
  if (!contains(bbox(s), p)) return null;
  if ('children' in s) {
    for (let i = s.children.length - 1; i >= 0; i--) {
      const c = s.children[i];
      if (c.type === 'TEXT') continue;
      const hit = paintAt(c, p);
      if (hit) return hit;
    }
  }
  return topPaint(s);
}

// What's painted behind a text node: walk up, checking lower siblings at each level, then the parent itself.
function backgroundOf(node, screen) {
  const p = center(node);
  let cur = node;
  while (cur && cur !== screen.parent) {
    const parent = cur.parent;
    if (!parent || parent.type === 'PAGE' || parent.type === 'DOCUMENT') break;
    const idx = parent.children.indexOf(cur);
    for (let i = idx - 1; i >= 0; i--) {
      const hit = paintAt(parent.children[i], p);
      if (hit) return hit;
    }
    const own = topPaint(parent);
    if (own) return own;
    if (parent === screen) break;
    cur = parent;
  }
  return { kind: 'solid', color: { r: 1, g: 1, b: 1 }, alpha: 1, assumed: true };
}

const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Union|Subtract|Intersect|Exclude|Image|Component|Instance|Section|Mask group|Arrow|Shape)( \d+)?$/i;

// ---------- screen discovery ----------

function isMobileFrame(n) {
  return (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE') &&
    n.width >= 320 && n.width <= 440 && n.height >= 560;
}

function discover(root) {
  const screens = [], skipped = [];
  function visit(n, insideTarget) {
    const info = { id: n.id, name: n.name, type: n.type, w: round(n.width || 0), h: round(n.height || 0) };
    if (/wayfare/i.test(n.name)) { skipped.push(Object.assign(info, { why: 'Wayfare' })); return; }
    if (n.type === 'SECTION' || (n.type === 'GROUP' && !isMobileFrame(n))) {
      for (const c of n.children) visit(c, insideTarget);
      return;
    }
    if (isMobileFrame(n)) { screens.push(n); return; }
    skipped.push(Object.assign(info, { why: 'not a mobile frame' }));
  }
  let scope = root;
  if (isMobileFrame(root) && root.parent) scope = root.parent; // a screen was linked: audit it and its siblings
  if (scope.type === 'PAGE' || scope.type === 'SECTION' || scope.type === 'FRAME' || scope.type === 'GROUP') {
    for (const c of scope.children) visit(c, true);
  }
  return { scope: { id: scope.id, name: scope.name, type: scope.type }, screens: screens, skipped: skipped };
}

// ---------- audit ----------

async function styleName(id) {
  if (!id || typeof id !== 'string') return null;
  try { const s = await figma.getStyleByIdAsync(id); return s ? s.name : null; } catch (e) { return null; }
}

async function auditScreen(screen, report, colorMap, sigMap, compMap) {
  const out = {
    id: screen.id, name: screen.name, w: round(screen.width), h: round(screen.height),
    layoutMode: screen.layoutMode, nodes: 0, texts: [], groups: [], framesNoAutoLayout: [],
    absoluteChildren: [], defaultNames: 0, defaultNameExamples: [], smallTargets: [], images: 0,
  };
  const all = screen.findAll(function () { return true; });
  out.nodes = all.length;

  for (const n of all) {
    // colours
    for (const prop of ['fills', 'strokes']) {
      if (!(prop in n) || !Array.isArray(n[prop])) continue;
      for (const f of n[prop]) {
        if (f.visible === false) continue;
        if (f.type === 'IMAGE') { out.images++; continue; }
        if (f.type !== 'SOLID') continue;
        const key = toHex(f.color) + (f.opacity !== undefined && f.opacity < 1 ? ' @' + round(f.opacity * 100) + '%' : '');
        if (!colorMap[key]) colorMap[key] = { hex: key, count: 0, fills: 0, strokes: 0, text: 0, bound: 0, screens: {} };
        const e = colorMap[key];
        e.count++;
        if (prop === 'strokes') e.strokes++; else if (n.type === 'TEXT') e.text++; else e.fills++;
        if (f.boundVariables && f.boundVariables.color) e.bound++;
        e.screens[screen.name] = true;
      }
    }

    // names
    if (n.type !== 'TEXT' && DEFAULT_NAME.test(n.name)) {
      out.defaultNames++;
      if (out.defaultNameExamples.length < 25) out.defaultNameExamples.push(n.name + ' [' + n.type + ' ' + n.id + ']');
    }

    // layout
    if (n.type === 'GROUP') out.groups.push({ id: n.id, name: n.name, children: n.children.length });
    if ((n.type === 'FRAME' || n.type === 'COMPONENT') && n.layoutMode === 'NONE' && n.children && n.children.length >= 2) {
      out.framesNoAutoLayout.push({ id: n.id, name: n.name, children: n.children.length, w: round(n.width), h: round(n.height) });
    }
    if ('layoutPositioning' in n && n.layoutPositioning === 'ABSOLUTE') out.absoluteChildren.push({ id: n.id, name: n.name });

    // instances
    if (n.type === 'INSTANCE') {
      let main = null;
      try { main = await n.getMainComponentAsync(); } catch (e) { main = null; }
      const key = main ? (main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent.name + ' / ' + main.name : main.name) : '(missing main)';
      if (!compMap[key]) compMap[key] = { count: 0, remote: main ? main.remote : null, screens: {} };
      compMap[key].count++;
      compMap[key].screens[screen.name] = true;
    }

    // repeated structures (candidates for components)
    if ((n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE') && n.children && n.children.length >= 2 && n.width >= 40 && n.height >= 24 && n !== screen) {
      const sig = round(n.width / 4) * 4 + 'x' + round(n.height / 4) * 4 + ':' + n.children.map(function (c) { return c.type[0]; }).join('');
      if (!sigMap[sig]) sigMap[sig] = { sig: sig, count: 0, examples: [] };
      sigMap[sig].count++;
      if (sigMap[sig].examples.length < 6) sigMap[sig].examples.push(screen.name + ' › ' + n.name + ' (' + n.id + ')');
    }

    // likely tap targets that are small
    if (/button|btn|icon|tab|nav|edit|delete|view|chip|close|back|filter|search|add|menu|more/i.test(n.name) && n.type !== 'TEXT') {
      const b = bbox(n);
      if (b.width > 0 && (b.width < 44 || b.height < 44)) {
        out.smallTargets.push({ id: n.id, name: n.name, type: n.type, w: round(b.width), h: round(b.height) });
      }
    }

    // text
    if (n.type === 'TEXT' && n.visible !== false) {
      let segs;
      try { segs = n.getStyledTextSegments(['fontName', 'fontSize', 'fills', 'textStyleId', 'lineHeight', 'letterSpacing']); } catch (e) { segs = []; }
      const bg = backgroundOf(n, screen);
      for (const s of segs) {
        const fillsArr = (s.fills || []).filter(function (f) { return f.visible !== false && f.type === 'SOLID'; });
        const f = fillsArr.length ? fillsArr[fillsArr.length - 1] : null;
        let color = null, ratio = null;
        if (f) {
          const a = (f.opacity === undefined ? 1 : f.opacity) * (n.opacity === undefined ? 1 : n.opacity);
          color = toHex(f.color) + (a < 1 ? ' @' + round(a * 100) + '%' : '');
          if (bg.kind === 'solid') {
            const shown = a < 1 ? blend(f.color, a, bg.color) : f.color;
            ratio = round(contrast(shown, bg.color), 2);
          }
        }
        out.texts.push({
          id: n.id, layer: n.name, chars: s.characters.replace(/\s+/g, ' ').slice(0, 60),
          font: s.fontName.family, weight: s.fontName.style, size: round(s.fontSize, 1),
          lineHeight: s.lineHeight.unit === 'AUTO' ? 'auto' : round(s.lineHeight.value, 1) + (s.lineHeight.unit === 'PERCENT' ? '%' : ''),
          letterSpacing: round(s.letterSpacing.value, 2) + (s.letterSpacing.unit === 'PERCENT' ? '%' : ''),
          color: color, colorBound: !!(f && f.boundVariables && f.boundVariables.color),
          bg: bg.kind === 'solid' ? toHex(bg.color) + (bg.assumed ? ' (assumed)' : '') : bg.kind,
          contrast: ratio, style: await styleName(s.textStyleId),
          w: round(n.width), h: round(n.height),
        });
      }
    }
  }
  return out;
}

async function fileTokens() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const vars = await figma.variables.getLocalVariablesAsync();
  const textStyles = await figma.getLocalTextStylesAsync();
  const paintStyles = await figma.getLocalPaintStylesAsync();
  return {
    collections: cols.map(function (c) {
      return { name: c.name, modes: c.modes.map(function (m) { return m.name; }), vars: vars.filter(function (v) { return v.variableCollectionId === c.id; }).length };
    }),
    textStyles: textStyles.map(function (s) { return s.name + ' — ' + s.fontName.family + ' ' + s.fontName.style + ' ' + s.fontSize; }),
    paintStyles: paintStyles.map(function (s) { return s.name; }),
  };
}

async function runA1() {
  const root = await figma.getNodeByIdAsync(ROOT_ID);
  if (!root) throw new Error('Node ' + ROOT_ID + ' not found. Open the "Web designs" file first.');
  const page = (function () { let p = root; while (p && p.type !== 'PAGE') p = p.parent; return p; })();
  if (page && page !== figma.currentPage) await figma.setCurrentPageAsync(page);

  const found = discover(root);
  if (!found.screens.length) throw new Error('No mobile-sized frames found under ' + root.name + ' (' + root.type + ')');

  const colorMap = {}, sigMap = {}, compMap = {};
  const screens = [];
  const pngs = [];
  const usedSlugs = {};
  for (const s of found.screens) {
    figma.notify('Auditing ' + s.name + '…', { timeout: 800 });
    screens.push(await auditScreen(s, null, colorMap, sigMap, compMap));
    let sl = slug(s.name);
    if (usedSlugs[sl]) sl = sl + '-' + s.id.replace(/[^0-9]+/g, '-');
    usedSlugs[sl] = true;
    screens[screens.length - 1].png = sl + '.png';
    pngs.push({ slug: sl, bytes: await s.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }) });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    file: figma.root.name,
    page: page ? page.name : null,
    root: { id: root.id, name: root.name, type: root.type },
    scope: found.scope,
    skipped: found.skipped,
    tokens: await fileTokens(),
    screens: screens,
    colors: Object.keys(colorMap).map(function (k) {
      const e = colorMap[k]; return Object.assign({}, e, { screens: Object.keys(e.screens) });
    }).sort(function (a, b) { return b.count - a.count; }),
    components: Object.keys(compMap).map(function (k) {
      return { name: k, count: compMap[k].count, remote: compMap[k].remote, screens: Object.keys(compMap[k].screens) };
    }).sort(function (a, b) { return b.count - a.count; }),
    repeated: Object.keys(sigMap).map(function (k) { return sigMap[k]; })
      .filter(function (e) { return e.count >= 2; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 60),
  };

  await upload('a1-audit', report, pngs);
  return '✓ A1 done: audited ' + screens.length + ' screens, report + PNGs saved. Nothing in the file was changed.';
}

// One hidden UI for the whole run: uploads to the receiver, and decodes PNGs to read real pixel colours.
const PLUGIN_UI = '<script>' +
  'function reply(m) { parent.postMessage({ pluginMessage: m }, "*"); }' +
  'onmessage = async function (ev) {' +
  '  const d = ev.data.pluginMessage; if (!d) return;' +
  '  if (d.type === "probe") {' +
  '    try {' +
  '      const bmp = await createImageBitmap(new Blob([d.bytes], { type: "image/png" }));' +
  '      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;' +
  '      const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);' +
  '      const colors = d.points.map(function (p) {' +
  '        const x = Math.min(bmp.width - 1, Math.round(p[0] * bmp.width)), y = Math.min(bmp.height - 1, Math.round(p[1] * bmp.height));' +
  '        return Array.from(ctx.getImageData(x, y, 1, 1).data);' +
  '      });' +
  '      reply({ id: d.id, colors: colors });' +
  '    } catch (e) { reply({ id: d.id, error: String(e && e.message ? e.message : e) }); }' +
  '    return;' +
  '  }' +
  '  try {' +
  '    for (const p of d.pngs) {' +
  '      const r = await fetch("' + RECEIVER + '/screens/" + p.slug, { method: "POST", body: new Blob([p.bytes], { type: "image/png" }) });' +
  '      if (!r.ok) throw new Error(p.slug + ": receiver said " + r.status);' +
  '    }' +
  '    const r = await fetch("' + RECEIVER + '/report/" + d.name, { method: "POST", headers: { "Content-Type": "text/plain" }, body: d.report });' +
  '    if (!r.ok) throw new Error("report: receiver said " + r.status);' +
  '    reply({ id: d.id, ok: true });' +
  '  } catch (e) { reply({ id: d.id, ok: false, error: String(e && e.message ? e.message : e) }); }' +
  '};' +
  '</script>';

let uiOpen = false, reqId = 0;
const pending = {};
function ui(msg) {
  if (!uiOpen) {
    figma.showUI(PLUGIN_UI, { visible: false });
    figma.ui.onmessage = function (m) { const p = pending[m.id]; if (p) { delete pending[m.id]; p(m); } };
    uiOpen = true;
  }
  return new Promise(function (resolve) {
    const id = ++reqId;
    pending[id] = resolve;
    figma.ui.postMessage(Object.assign({ id: id }, msg));
  });
}
// Sends PNGs, then the JSON report (last, so the receiver knows the run is complete).
async function upload(name, report, pngs) {
  const r = await ui({ type: 'upload', name: name, pngs: pngs, report: JSON.stringify(report, null, 2) });
  if (!r.ok) throw new Error(r.error + ' (is the receiver running? node figma-plugin/receiver.mjs)');
}
// Real rendered colours at fractional points [[x, y], ...] of a node (exported small, decoded in the UI).
async function probe(node, points) {
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 0.25 } });
  const r = await ui({ type: 'probe', bytes: bytes, points: points });
  if (r.error) throw new Error('pixel probe failed: ' + r.error);
  return r.colors;
}
function isDark(colors) { return colors.some(function (c) { return c[3] > 0 && c[0] + c[1] + c[2] < 120; }); }
function rgbaHex(c) { return '#' + c.slice(0, 3).map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('').toUpperCase() + (c[3] < 255 ? ' a' + c[3] : ''); }

// =====================================================================
// A2 · Tokens — variables, text styles and a specimen sheet
// =====================================================================

const FONT = 'Instrument Sans';
const SCOPE = {
  fill: ['ALL_FILLS', 'STROKE_COLOR'],
  text: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'],
  surface: ['FRAME_FILL', 'SHAPE_FILL'],
  border: ['STROKE_COLOR'],
};

// [name, hex, scopes, description]
const HH_COLORS = [
  ['brand/primary', '#2E4482', SCOPE.fill, 'Navy: primary buttons, headings, active nav. 9.3:1 on white.'],
  ['brand/primary-soft', '#E8ECF7', SCOPE.fill, 'Selected chips, active nav pill on white, info surfaces.'],
  ['accent/teal', '#14A38B', SCOPE.fill, 'Success / verified / health-positive FILLS and icons only (3.2:1 — not for text).'],
  ['accent/teal-soft', '#E3F5F1', SCOPE.fill, 'Background for success / verified pills.'],
  ['accent/teal-text', '#0F7A68', SCOPE.text, 'Teal for text: 5.2:1 on white, 4.6:1 on teal-soft.'],
  ['status/warning', '#B7791F', SCOPE.fill, 'Due soon FILLS and icons only (3.6:1 — not for text).'],
  ['status/warning-soft', '#FDF3E1', SCOPE.fill, 'Background for due-soon pills.'],
  ['status/warning-text', '#94600F', SCOPE.text, 'Amber for text: 5.3:1 on white, 4.8:1 on warning-soft.'],
  ['status/danger', '#C93A3A', SCOPE.fill, 'Errors and destructive actions only. White text on it: 5.1:1.'],
  ['status/danger-soft', '#FCEBEB', SCOPE.fill, 'Background for error / overdue pills.'],
  ['status/danger-text', '#B03030', SCOPE.text, 'Red for text: 6.3:1 on white, 5.5:1 on danger-soft.'],
  ['text/primary', '#1B2333', SCOPE.text, 'Body and titles. 14.7:1 on background.'],
  ['text/secondary', '#5B6475', SCOPE.text, 'Secondary text. 5.6:1 on background, 6.0:1 on white.'],
  ['text/inverse', '#FFFFFF', SCOPE.text, 'Text and icons on navy / danger.'],
  ['surface/background', '#F6F7FB', SCOPE.surface, 'Screen background.'],
  ['surface/card', '#FFFFFF', SCOPE.surface, 'Cards, sheets, nav bar.'],
  ['border/subtle', '#E4E7EF', SCOPE.border, 'Dividers and card outlines (decorative).'],
  ['border/strong', '#858D9E', SCOPE.border, 'Input and control outlines: 3.3:1 on white (WCAG non-text).'],
];
const HH_SPACE = [4, 8, 12, 16, 20, 24, 32];
const HH_RADIUS = [['sm', 8], ['button', 12], ['card', 16], ['sheet', 24], ['pill', 999]];
// [name, weight, size, lineHeight, letterSpacing %, use]
const HH_TYPE = [
  ['Display/28 Bold', 'Bold', 28, 34, -1, 'Greeting, splash, confirmation titles'],
  ['Title/22 SemiBold', 'SemiBold', 22, 28, -0.5, 'Screen titles'],
  ['Heading/18 SemiBold', 'SemiBold', 18, 24, 0, 'Section headings, card titles'],
  ['Subheading/16 SemiBold', 'SemiBold', 16, 22, 0, 'Names, list titles, date + time'],
  ['Body/15 Regular', 'Regular', 15, 22, 0, 'Body copy, descriptions'],
  ['Body/14 Medium', 'Medium', 14, 20, 0, 'Buttons, chips, list rows'],
  ['Caption/13 Regular', 'Regular', 13, 18, 0, 'Meta: dates, doctor, clinic'],
  ['Micro/12 Medium', 'Medium', 12, 16, 0.5, 'Tab labels, pills, tile labels — the minimum size'],
];

function rgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 };
}

async function collection(name, modeName) {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  let c = cols.filter(function (x) { return x.name === name; })[0];
  const created = !c;
  if (!c) c = figma.variables.createVariableCollection(name);
  if (c.modes[0].name !== modeName) c.renameMode(c.modes[0].modeId, modeName);
  return { col: c, created: created };
}

function upsertVar(all, col, name, type, value, scopes, description, log) {
  let v = all.filter(function (x) { return x.variableCollectionId === col.id && x.name === name; })[0];
  if (!v) { v = figma.variables.createVariable(name, col, type); log.created++; } else log.updated++;
  v.setValueForMode(col.modes[0].modeId, value);
  v.scopes = scopes;
  if (description) v.description = description;
  return v;
}

const HV = {}; // HealthHub variables by name
const HS = {}; // HealthHub text styles by short name

async function runA2() {
  for (const w of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    try { await figma.loadFontAsync({ family: FONT, style: w }); }
    catch (e) { throw new Error('Font "' + FONT + ' ' + w + '" is not available in this Figma app'); }
  }

  const root = await figma.getNodeByIdAsync(ROOT_ID);
  if (!root) throw new Error('Node ' + ROOT_ID + ' not found. Open the "Web designs" file first.');
  let page = root; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);

  // ---- variables ----
  const log = { created: 0, updated: 0 };
  const colors = await collection('HealthHub/Colors', 'Light');
  const spacing = await collection('HealthHub/Spacing', 'Value');
  const radii = await collection('HealthHub/Radius', 'Value');
  const all = await figma.variables.getLocalVariablesAsync();
  for (const c of HH_COLORS) {
    const col = rgb(c[1]);
    HV[c[0]] = upsertVar(all, colors.col, c[0], 'COLOR', { r: col.r, g: col.g, b: col.b, a: 1 }, c[2], c[3], log);
  }
  for (const s of HH_SPACE) HV['space/' + s] = upsertVar(all, spacing.col, 'space/' + s, 'FLOAT', s, ['GAP'], null, log);
  HV['space/screen'] = upsertVar(all, spacing.col, 'space/screen', 'FLOAT', 20, ['GAP'], 'Horizontal screen padding', log);
  for (const r of HH_RADIUS) HV['radius/' + r[0]] = upsertVar(all, radii.col, 'radius/' + r[0], 'FLOAT', r[1], ['CORNER_RADIUS'], null, log);

  // ---- text styles ----
  const styleLog = { created: 0, updated: 0 };
  const existing = await figma.getLocalTextStylesAsync();
  for (const t of HH_TYPE) {
    const full = 'HealthHub/' + t[0];
    let s = existing.filter(function (x) { return x.name === full; })[0];
    if (!s) { s = figma.createTextStyle(); s.name = full; styleLog.created++; } else styleLog.updated++;
    s.fontName = { family: FONT, style: t[1] };
    s.fontSize = t[2];
    s.lineHeight = { unit: 'PIXELS', value: t[3] };
    s.letterSpacing = { unit: 'PERCENT', value: t[4] };
    s.description = t[5] + ' — ' + t[2] + '/' + t[3];
    HS[t[0]] = s;
  }

  // ---- specimen sheet ----
  const sheet = await buildTokenSheet(page, root);
  figma.currentPage.selection = [sheet.section];
  figma.viewport.scrollAndZoomIntoView([sheet.section]);

  const png = await sheet.frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
  const report = {
    generatedAt: new Date().toISOString(),
    variables: log, textStyles: styleLog,
    collections: [colors, spacing, radii].map(function (x) { return { name: x.col.name, created: x.created, mode: x.col.modes[0].name, count: x.col.variableIds.length }; }),
    colors: HH_COLORS.map(function (c) { return c[0] + ' ' + c[1]; }),
    styles: HH_TYPE.map(function (t) { return 'HealthHub/' + t[0]; }),
    contrast: sheet.contrast,
    section: { id: sheet.section.id, x: sheet.section.x, y: sheet.section.y, w: sheet.section.width, h: sheet.section.height },
  };
  await upload('a2-tokens', report, [{ slug: 'a2-tokens-sheet', bytes: png }]);
  return '✓ A2 done: ' + (log.created + log.updated) + ' variables (' + log.created + ' new), ' +
    (styleLog.created + styleLog.updated) + ' text styles (' + styleLog.created + ' new), tokens sheet selected. Screens not changed.';
}

// ---- sheet helpers ----
function hpaint(name) {
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', HV[name]);
}
function stack(name, dir, gapPx, padPx) {
  const f = figma.createFrame();
  f.name = name; f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = gapPx || 0;
  f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = padPx || 0;
  f.fills = [];
  return f;
}
async function label(chars, style, colorVar, name) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(HS[style].id);
  t.characters = chars;
  t.fills = [hpaint(colorVar || 'text/primary')];
  t.name = name || chars.slice(0, 30);
  return t;
}
function bindRadius(n, key) {
  for (const c of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(c, HV['radius/' + key]);
}

async function buildTokenSheet(page, root) {
  const NAME = 'HealthHub / Tokens';
  const old = page.children.filter(function (n) { return n.name === NAME; })[0];
  let x, y;
  if (old) { x = old.x; y = old.y; old.remove(); }
  else {
    const rb = root.absoluteBoundingBox;
    let right = rb.x + rb.width;
    for (const n of page.children) {
      const b = n.absoluteBoundingBox;
      if (!b || n === root) continue;
      const overlapsBand = b.y < rb.y + rb.height + 2000 && b.y + b.height > rb.y - 200;
      if (overlapsBand && b.x + b.width > right && b.x >= rb.x) right = b.x + b.width;
    }
    x = Math.round(right + 240); y = Math.round(rb.y);
  }

  const frame = stack('Tokens sheet', 'VERTICAL', 56, 56);
  frame.fills = [hpaint('surface/background')];
  bindRadius(frame, 'sheet');

  const head = stack('Header', 'VERTICAL', 8);
  head.appendChild(await label('HealthHub tokens', 'Display/28 Bold'));
  head.appendChild(await label('HealthHub/Colors · HealthHub/Spacing · HealthHub/Radius · HealthHub/ text styles in ' + FONT, 'Body/15 Regular', 'text/secondary'));
  frame.appendChild(head);

  // colours
  const colorBlock = stack('Colors', 'VERTICAL', 24);
  colorBlock.appendChild(await label('Colour', 'Title/22 SemiBold'));
  const groups = {};
  for (const c of HH_COLORS) { const g = c[0].split('/')[0]; (groups[g] = groups[g] || []).push(c); }
  for (const g of Object.keys(groups)) {
    const row = stack(g, 'HORIZONTAL', 16);
    for (const c of groups[g]) {
      const card = stack(c[0], 'VERTICAL', 4);
      const sw = figma.createRectangle();
      sw.name = 'swatch'; sw.resize(160, 72);
      sw.fills = [hpaint(c[0])];
      sw.strokes = [hpaint('border/subtle')]; sw.strokeWeight = 1; sw.strokeAlign = 'INSIDE';
      bindRadius(sw, 'button');
      card.appendChild(sw);
      card.appendChild(await label(c[0], 'Micro/12 Medium'));
      card.appendChild(await label(c[1], 'Caption/13 Regular', 'text/secondary'));
      row.appendChild(card);
    }
    colorBlock.appendChild(row);
  }
  frame.appendChild(colorBlock);

  // contrast checks: real text-on-surface pairs used by the components
  const pairs = [
    ['text/primary', 'surface/background', 'Body text'], ['text/secondary', 'surface/card', 'Secondary text'],
    ['text/inverse', 'brand/primary', 'Primary button'], ['brand/primary', 'brand/primary-soft', 'Active chip'],
    ['accent/teal-text', 'accent/teal-soft', 'Verified'], ['status/warning-text', 'status/warning-soft', 'Due in 3 days'],
    ['status/danger-text', 'status/danger-soft', 'Overdue'], ['text/inverse', 'status/danger', 'Delete'],
  ];
  const hex = {}; for (const c of HH_COLORS) hex[c[0]] = rgb(c[1]);
  const contrastOut = [];
  const cBlock = stack('Contrast', 'VERTICAL', 16);
  cBlock.appendChild(await label('Text on surface (WCAG AA needs 4.5:1)', 'Title/22 SemiBold'));
  const cRow = stack('pairs', 'HORIZONTAL', 12);
  for (const p of pairs) {
    const ratio = round(contrast(hex[p[0]], hex[p[1]]), 2);
    contrastOut.push(p[0] + ' on ' + p[1] + ' = ' + ratio);
    const pill = stack(p[2], 'VERTICAL', 2, 12);
    pill.paddingLeft = pill.paddingRight = 16;
    pill.fills = [hpaint(p[1])];
    bindRadius(pill, 'button');
    pill.appendChild(await label(p[2], 'Body/14 Medium', p[0]));
    pill.appendChild(await label(ratio + ':1 · ' + (ratio >= 4.5 ? 'AA pass' : 'FAIL'), 'Micro/12 Medium', p[0]));
    cRow.appendChild(pill);
  }
  cBlock.appendChild(cRow);
  frame.appendChild(cBlock);

  // type
  const typeBlock = stack('Type', 'VERTICAL', 20);
  typeBlock.appendChild(await label('Type', 'Title/22 SemiBold'));
  for (const t of HH_TYPE) {
    const row = stack(t[0], 'HORIZONTAL', 32);
    row.counterAxisAlignItems = 'CENTER';
    const meta = await label('HealthHub/' + t[0] + '\n' + t[2] + '/' + t[3] + ' · ' + t[1], 'Caption/13 Regular', 'text/secondary');
    meta.textAutoResize = 'HEIGHT'; meta.resize(260, meta.height);
    row.appendChild(meta);
    row.appendChild(await label(t[0].indexOf('Micro') === 0 || t[0].indexOf('Caption') === 0 ? 'Dr. Ananya Rao · Thu 19 Nov, 4:30 PM' : "Your family's health, organised", t[0]));
    typeBlock.appendChild(row);
  }
  frame.appendChild(typeBlock);

  // spacing + radius
  const sr = stack('Spacing and radius', 'HORIZONTAL', 96);
  const sp = stack('Spacing', 'VERTICAL', 12);
  sp.appendChild(await label('Spacing', 'Title/22 SemiBold'));
  for (const s of HH_SPACE.concat(['screen'])) {
    const row = stack('space/' + s, 'HORIZONTAL', 16);
    row.counterAxisAlignItems = 'CENTER';
    const bar = figma.createRectangle();
    const val = s === 'screen' ? 20 : s;
    bar.resize(val * 4, 16); bar.fills = [hpaint('brand/primary')]; bar.name = 'bar';
    const lab = await label('space/' + s + ' = ' + val, 'Caption/13 Regular', 'text/secondary');
    row.appendChild(lab); lab.textAutoResize = 'HEIGHT'; lab.resize(140, lab.height);
    row.appendChild(bar);
    sp.appendChild(row);
  }
  sr.appendChild(sp);
  const rd = stack('Radius', 'VERTICAL', 12);
  rd.appendChild(await label('Radius', 'Title/22 SemiBold'));
  const rrow = stack('samples', 'HORIZONTAL', 20);
  for (const r of HH_RADIUS) {
    const col = stack('radius/' + r[0], 'VERTICAL', 8);
    col.counterAxisAlignItems = 'CENTER';
    const box = figma.createRectangle();
    box.resize(r[0] === 'pill' ? 120 : 80, r[0] === 'pill' ? 44 : 80);
    box.fills = [hpaint('brand/primary-soft')];
    box.strokes = [hpaint('brand/primary')]; box.strokeWeight = 1.5; box.strokeAlign = 'INSIDE';
    bindRadius(box, r[0]);
    col.appendChild(box);
    col.appendChild(await label('radius/' + r[0] + ' = ' + r[1], 'Caption/13 Regular', 'text/secondary'));
    rrow.appendChild(col);
  }
  rd.appendChild(rrow);
  sr.appendChild(rd);
  frame.appendChild(sr);

  const section = figma.createSection();
  section.name = NAME;
  page.appendChild(section);
  section.x = x; section.y = y;
  section.appendChild(frame);
  frame.x = 80; frame.y = 80;
  section.resizeWithoutConstraints(frame.width + 160, frame.height + 160);
  return { section: section, frame: frame, contrast: contrastOut };
}

// =====================================================================
// A3 · Component kit
// =====================================================================

const HI = {};   // icon components by name
const HSET = {}; // components / component sets by name
const IMG = {};  // harvested image paints (3D tile illustrations)
const ROWS = []; // [name, row frame] for the screenshot export
let hboard;

const SHADOW_CARD = { type: 'DROP_SHADOW', color: { r: 0.106, g: 0.137, b: 0.2, a: 0.08 }, offset: { x: 0, y: 2 }, radius: 8, spread: 0, visible: true, blendMode: 'NORMAL' };
const SHADOW_FLOAT = { type: 'DROP_SHADOW', color: { r: 0.106, g: 0.137, b: 0.2, a: 0.14 }, offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true, blendMode: 'NORMAL' };

async function loadHH() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const ids = cols.filter(function (c) { return c.name.indexOf('HealthHub/') === 0; }).map(function (c) { return c.id; });
  const vars = await figma.variables.getLocalVariablesAsync();
  for (const v of vars) if (ids.indexOf(v.variableCollectionId) >= 0) HV[v.name] = v;
  const styles = await figma.getLocalTextStylesAsync();
  for (const s of styles) if (s.name.indexOf('HealthHub/') === 0) HS[s.name.slice('HealthHub/'.length)] = s;
  const missing = HH_COLORS.map(function (c) { return c[0]; }).filter(function (n) { return !HV[n]; })
    .concat(HH_TYPE.map(function (t) { return t[0]; }).filter(function (n) { return !HS[n]; }));
  if (missing.length) throw new Error('Run A2 first. Missing tokens: ' + missing.join(', '));
  for (const w of ['Regular', 'Medium', 'SemiBold', 'Bold']) await figma.loadFontAsync({ family: FONT, style: w });
}

// ---------- layout helpers ----------
function fillV(n, name) { n.fills = [hpaint(name)]; }
function strokeV(n, name, w) { n.strokes = [hpaint(name)]; n.strokeWeight = w || 1; n.strokeAlign = 'INSIDE'; }
function sp(n, prop, v) { n[prop] = v; const vv = HV['space/' + v]; if (vv) n.setBoundVariable(prop, vv); }
function padV(n, t, r, b, l) { sp(n, 'paddingTop', t); sp(n, 'paddingRight', r); sp(n, 'paddingBottom', b); sp(n, 'paddingLeft', l); }
function gapV(n, v) { sp(n, 'itemSpacing', v); }
function auto(name, dir) {
  const f = figma.createFrame();
  f.name = name; f.fills = []; f.clipsContent = false;
  f.layoutMode = dir; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  return f;
}
function comp(name, dir) {
  const c = figma.createComponent();
  c.name = name; c.fills = []; c.clipsContent = false;
  if (dir) { c.layoutMode = dir; c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO'; }
  return c;
}
function fixed(n, w, h) { n.resize(w, h); n.primaryAxisSizingMode = 'FIXED'; n.counterAxisSizingMode = 'FIXED'; }
// fixed width, hug height
function wFixed(n, w) {
  n.resize(w, Math.max(n.height, 1));
  if (n.layoutMode === 'VERTICAL') { n.counterAxisSizingMode = 'FIXED'; n.primaryAxisSizingMode = 'AUTO'; }
  else { n.primaryAxisSizingMode = 'FIXED'; n.counterAxisSizingMode = 'AUTO'; }
}
function mid(n) { n.primaryAxisAlignItems = 'CENTER'; n.counterAxisAlignItems = 'CENTER'; }
function circ(name, size, bg) {
  const f = auto(name, 'HORIZONTAL'); mid(f); fixed(f, size, size); bindRadius(f, 'pill');
  if (bg) fillV(f, bg);
  return f;
}
function cardStyle(c) { bindRadius(c, 'card'); fillV(c, 'surface/card'); strokeV(c, 'border/subtle', 1); }
async function tx(chars, style, color, name) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(HS[style].id);
  t.characters = chars;
  t.fills = [hpaint(color)];
  t.name = name || chars.slice(0, 30);
  return t;
}
// text that fills its auto-layout parent's width (must already be appended)
function fillW(t, maxLines) {
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FILL';
  if (maxLines) { t.textTruncation = 'ENDING'; t.maxLines = maxLines; }
}
function divider(parent) {
  const d = figma.createRectangle();
  d.name = 'Divider'; d.resize(100, 1); fillV(d, 'border/subtle');
  parent.appendChild(d); d.layoutSizingHorizontal = 'FILL';
  return d;
}
function ic(name, color, size) {
  if (!HI[name]) throw new Error('No icon "' + name + '"');
  const inst = HI[name].createInstance();
  inst.name = 'Icon';
  size = size || 24;
  if (size !== 24) inst.resize(size, size);
  const vec = inst.findOne(function (n) { return n.type === 'VECTOR'; });
  if (vec) {
    if (color) { if (vec.strokes.length) vec.strokes = [hpaint(color)]; else vec.fills = [hpaint(color)]; }
    if (vec.strokes.length && size >= 40) vec.strokeWeight = size >= 64 ? 2.5 : 2;
  }
  return inst;
}

// ---------- component property helpers ----------
function ownLayers(owner, test) {
  return owner.findAll(function (n) {
    if (!test(n)) return false;
    for (let p = n.parent; p && p !== owner; p = p.parent) if (p.type === 'INSTANCE') return false;
    return true;
  });
}
function bindText(owner, layerName, propName, def) {
  const key = owner.addComponentProperty(propName, 'TEXT', def);
  ownLayers(owner, function (n) { return n.type === 'TEXT' && n.name === layerName; }).forEach(function (n) {
    n.componentPropertyReferences = Object.assign({}, n.componentPropertyReferences, { characters: key });
  });
}
function bindSwap(owner, layerName, propName, defaultIcon) {
  const key = owner.addComponentProperty(propName, 'INSTANCE_SWAP', HI[defaultIcon].id);
  ownLayers(owner, function (n) { return n.type === 'INSTANCE' && n.name === layerName; }).forEach(function (n) {
    n.componentPropertyReferences = Object.assign({}, n.componentPropertyReferences, { mainComponent: key });
  });
}
function bindBool(owner, layerName, propName, def) {
  const key = owner.addComponentProperty(propName, 'BOOLEAN', def);
  ownLayers(owner, function (n) { return n.name === layerName && n.type !== 'VECTOR'; }).forEach(function (n) {
    n.componentPropertyReferences = Object.assign({}, n.componentPropertyReferences, { visible: key });
  });
}
function setProps(inst, map) {
  const out = {};
  for (const k of Object.keys(inst.componentProperties)) {
    const base = k.split('#')[0];
    if (Object.prototype.hasOwnProperty.call(map, base)) out[k] = map[base];
  }
  inst.setProperties(out);
  return inst;
}
function variant(setName, variantName) {
  const v = HSET[setName].children.filter(function (c) { return c.name === variantName; })[0];
  if (!v) throw new Error(setName + ' has no variant ' + variantName);
  return v.createInstance();
}
function styleSet(set, dir, wrapWidth) {
  set.layoutMode = dir; set.primaryAxisSizingMode = 'AUTO'; set.counterAxisSizingMode = 'AUTO';
  set.itemSpacing = 24; set.counterAxisSpacing = 24;
  set.paddingTop = 24; set.paddingBottom = 24; set.paddingLeft = 24; set.paddingRight = 24;
  if (wrapWidth) { set.layoutWrap = 'WRAP'; set.resize(wrapWidth, set.height); set.primaryAxisSizingMode = 'FIXED'; }
  set.fills = [hpaint('surface/background')]; set.cornerRadius = 16;
}
function stage(row) {
  const s = auto('Stage', 'HORIZONTAL');
  s.itemSpacing = 24; s.paddingTop = 24; s.paddingBottom = 24; s.paddingLeft = 24; s.paddingRight = 24;
  s.fills = [hpaint('surface/background')]; s.cornerRadius = 16;
  row.appendChild(s);
  return s;
}
async function hrow(name, desc) {
  const r = auto('Row / ' + name, 'VERTICAL');
  r.itemSpacing = 12;
  hboard.appendChild(r);
  r.appendChild(await tx(name, 'Title/22 SemiBold', 'text/primary', 'Row title'));
  const d = await tx(desc, 'Body/15 Regular', 'text/secondary', 'Row description');
  r.appendChild(d); d.textAutoResize = 'HEIGHT'; d.resize(1000, d.height);
  ROWS.push([name, r]);
  return r;
}

// instance shortcuts
function pill(status, labelOverride) {
  const p = variant('StatusPill', 'Status=' + status);
  p.name = 'StatusPill';
  if (labelOverride) p.findOne(function (n) { return n.type === 'TEXT'; }).characters = labelOverride;
  return p;
}
function btn(style, size, labelText, iconName) {
  const b = variant('Button', 'Style=' + style + ', Size=' + size);
  b.name = 'Button / ' + labelText;
  const map = { Label: labelText };
  if (iconName) { map['Show icon'] = true; map.Icon = HI[iconName].id; }
  return setProps(b, map);
}
function avatar(size, tone, initials) {
  const a = variant('Avatar', 'Size=' + size + ', Tone=' + tone);
  a.name = 'Avatar';
  return setProps(a, { Initials: initials });
}

// ---------- icons ----------
// iconsax-style Linear: 24px grid, 1.5 stroke, round caps/joins
const HH_ICONS = {
  'Home': '<path d="M3.5 10.2 12 3.5l8.5 6.7V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 17v-3"/>',
  'Document': '<path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14.5 3v4.5H19M8.5 12.5h7M8.5 16h5"/>',
  'Calendar': '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
  'Calendar Tick': '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18M9 15l2 2 4-4"/>',
  'User': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  'People': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .6 3.5 2.4 3.5 5.2"/>',
  'Search': '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.2-4.2"/>',
  'Filter': '<path d="M3 7h6M15 7h6M3 17h10M19 17h2"/><circle cx="12" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  'Bell': '<path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 16h15L18 12.5V9a6 6 0 0 0-6-6zM9.5 19.5a2.5 2.5 0 0 0 5 0"/>',
  'Plus': '<path d="M12 5v14M5 12h14"/>',
  'Minus': '<path d="M5 12h14"/>',
  'Close': '<path d="M6 6l12 12M18 6 6 18"/>',
  'Tick': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'Tick Circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.8 2.8L16 9.5"/>',
  'Chevron Right': '<path d="M9 5l7 7-7 7"/>',
  'Chevron Left': '<path d="M15 5l-7 7 7 7"/>',
  'Chevron Down': '<path d="M5 9l7 7 7-7"/>',
  'Arrow Left': '<path d="M10 6 4 12l6 6M20 12H4"/>',
  'Arrow Right': '<path d="M14 6l6 6-6 6M4 12h16"/>',
  'More': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'Edit': '<path d="M13.5 5.5l5 5M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19z"/>',
  'Trash': '<path d="M4 6.5h16M9.5 6.5v-2a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2M6 6.5l1 13a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13M10 11v6M14 11v6"/>',
  'Upload': '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"/>',
  'Download': '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3"/>',
  'Share': '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
  'Copy': '<rect x="8.5" y="8.5" width="12.5" height="12.5" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  'Camera': '<path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.6-2.5h6.4l1.6 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  'Gallery': '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M3.5 17.5 9 13l4 3.5 3-2.5 4.5 4"/>',
  'Paperclip': '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4L14.5 7.5"/>',
  'Prescription': '<path d="M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="3" rx="1"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  'Flask': '<path d="M9.5 3h5M10.5 3v6L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3M7.5 14.5h9"/>',
  'Scan': '<path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2M7 12h10"/>',
  'Syringe': '<path d="M17 3l4 4M19 5l-2.5 2.5M15 5l4 4-9 9H6v-4zM6 18l-3.5 3.5M11.5 8.5l2 2M8.5 11.5l2 2"/>',
  'Hospital': '<path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15M2.5 21h19M12 7.5v5M9.5 10h5M10 21v-4h4v4"/>',
  'Pill': '<rect x="8" y="2.5" width="8" height="19" rx="4"/><path d="M8 12h8"/>',
  'Stethoscope': '<path d="M3.5 3h3M12.5 3h3M5 3v5a4.5 4.5 0 0 0 9 0V3M9.5 12.5V15a5 5 0 0 0 10 0v-2"/><circle cx="19.5" cy="11" r="2"/>',
  'Paw': '<circle cx="6" cy="10" r="1.8"/><circle cx="9.5" cy="5.5" r="1.8"/><circle cx="14.5" cy="5.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 11c-2.6 0-5.5 3.8-5.5 6.5 0 1.8 1.4 3 3 3 1 0 1.7-.6 2.5-.6s1.5.6 2.5.6c1.6 0 3-1.2 3-3 0-2.7-2.9-6.5-5.5-6.5z"/>',
  'Heart Pulse': '<path d="M12 20.5s-8.5-4.9-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6.1-8.5 11-8.5 11z"/><path d="M6 12h3l1.5-2.5 2.5 5 1.5-2.5h3.5"/>',
  'Droplet': '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z"/>',
  'Clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  'Alarm': '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M3.5 5.5l3-2.5M20.5 5.5l-3-2.5"/>',
  'Location': '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  'Directions': '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M9 13.5V12a1.5 1.5 0 0 1 1.5-1.5H15M13 8.5l2 2-2 2"/>',
  'Phone': '<path d="M5 3.5h3l1.5 4.5-2 1.5a12 12 0 0 0 7 7l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>',
  'Shield Tick': '<path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
  'Lock': '<rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2"/>',
  'ID Card': '<rect x="2.5" y="5" width="19" height="14" rx="3"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.5-1.5 1.6-2.3 3-2.3s2.5.8 3 2.3M14.5 10h4M14.5 13.5h3"/>',
  'Card': '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h3"/>',
  'Info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  'Warning': '<path d="M10.3 4.5a2 2 0 0 1 3.4 0l7.8 13.5a2 2 0 0 1-1.7 3H4.2a2 2 0 0 1-1.7-3z"/><path d="M12 10v4M12 17.2h.01"/>',
  'Help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  'Logout': '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/>',
  'Settings': '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><circle cx="12" cy="12" r="3"/>',
  'Grid': '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  'Folder': '<path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10.5h18"/>',
  'Wifi Off': '<path d="M2.5 8.5a14 14 0 0 1 4.3-2.6M10 5.2a14 14 0 0 1 11.5 3.3M5.5 12a9.5 9.5 0 0 1 3.4-2M13.6 9.6a9.5 9.5 0 0 1 4.9 2.4M8.7 15.4a5 5 0 0 1 6.6 0M12 19h.01M3 3l18 18"/>',
  'Refresh': '<path d="M20 11.5A8 8 0 0 0 5.6 7M4 12.5A8 8 0 0 0 18.4 17M5 3.5v4h4M19 20.5v-4h-4"/>',
  'Heart': '<path d="M12 20.5s-8.5-4.9-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6.1-8.5 11-8.5 11z"/>',
  // added for A5b (specialties, doctor profile, payment); A5b inserts any that are missing from the kit
  'Eye': '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  'Tooth': '<path d="M7.5 3.5c-2.5 0-4 2-4 4.5 0 2.5 1.2 4 1.8 6.5.6 2.6 1 6 2.7 6 1.6 0 1.7-3.3 2.5-5 .4-.8.9-1 1.5-1s1.1.2 1.5 1c.8 1.7.9 5 2.5 5 1.7 0 2.1-3.4 2.7-6 .6-2.5 1.8-4 1.8-6.5 0-2.5-1.5-4.5-4-4.5-1.8 0-2.7 1-4.5 1s-2.7-1-4.5-1z"/>',
  'Bone': '<circle cx="5.8" cy="15.8" r="2.2"/><circle cx="8.2" cy="18.2" r="2.2"/><circle cx="15.8" cy="5.8" r="2.2"/><circle cx="18.2" cy="8.2" r="2.2"/><path d="M8.3 14.2l5.9-5.9M9.8 15.7l5.9-5.9"/>',
  'Brain': '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 2 2 0 0 0 3-1.7V5.7A2 2 0 0 0 9 4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 2 2 0 0 1-3-1.7M15 4a2 2 0 0 0-3 1.7"/>',
  'Ear': '<path d="M7 9a5 5 0 0 1 10 0c0 3-2.5 4-3.5 6-.8 1.7-1 3.5-3 3.5A2.5 2.5 0 0 1 8 16"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.3-1 1.8-1.8 2.5"/>',
  'Baby': '<circle cx="12" cy="8" r="4.5"/><path d="M10.5 8h.01M13.5 8h.01M11 10.2c.6.4 1.4.4 2 0M5.5 21c.5-3.5 3.2-6 6.5-6s6 2.5 6.5 6"/>',
  'Female': '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5v7M9 18.5h6"/>',
  'Sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  'Sort': '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
  'Graduation': '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5M21.5 9v5"/>',
  'Wallet': '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v2.5"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M16 13.5h.01"/>',
  'Language': '<path d="M3 5.5h9M7.5 3.5v2M5 5.5c.5 3 2.5 5.5 5.5 6.5M10 5.5c-.5 3-2.5 5.5-5.5 6.5M12.5 20.5l4-9 4 9M14 17h5"/>',
};
const HH_ICONS_FILLED = {
  'Star Filled': ['<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>', 'status/warning'],
};

function makeIcon(parent, name, inner, filledVar) {
  const svg = filledVar
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000" stroke="none">' + inner + '</svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  const frame = figma.createNodeFromSvg(svg);
  const vec = figma.flatten(frame.children.slice(), frame);
  const c = figma.createComponent();
  c.name = 'Icon/' + name; c.resize(24, 24); c.fills = []; c.clipsContent = false;
  parent.appendChild(c);
  const vx = vec.x, vy = vec.y;
  c.appendChild(vec);
  vec.x = vx; vec.y = vy; vec.name = 'Icon';
  vec.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  if (filledVar) { vec.fills = [hpaint(filledVar)]; vec.strokes = []; }
  else { vec.strokes = [hpaint('text/primary')]; vec.strokeWeight = 1.5; vec.fills = []; }
  frame.remove();
  c.description = name + (filledVar ? ' — filled.' : ' — iconsax-style Linear, 24px, 1.5 stroke.');
  HI[name] = c;
  return c;
}

async function buildIcons() {
  const row = await hrow('Icons', Object.keys(HH_ICONS).length + 1 + ' icons, iconsax-style Linear (24px grid, 1.5 stroke, round caps). Components use them through Icon swap properties; recolour by overriding the vector stroke with a token.');
  const grid = auto('Icon grid', 'HORIZONTAL');
  grid.itemSpacing = 8; grid.counterAxisSpacing = 8; grid.layoutWrap = 'WRAP';
  grid.paddingTop = 24; grid.paddingBottom = 24; grid.paddingLeft = 24; grid.paddingRight = 24;
  grid.fills = [hpaint('surface/background')]; grid.cornerRadius = 16;
  row.appendChild(grid);
  grid.resize(1000, 100); grid.primaryAxisSizingMode = 'FIXED'; grid.counterAxisSizingMode = 'AUTO';
  const names = Object.keys(HH_ICONS).concat(Object.keys(HH_ICONS_FILLED));
  for (const name of names) {
    const cell = auto('Cell / ' + name, 'VERTICAL');
    cell.counterAxisAlignItems = 'CENTER'; cell.itemSpacing = 6;
    cell.resize(84, 60); cell.counterAxisSizingMode = 'FIXED';
    grid.appendChild(cell);
    if (HH_ICONS[name]) makeIcon(cell, name, HH_ICONS[name], null);
    else makeIcon(cell, name, HH_ICONS_FILLED[name][0], HH_ICONS_FILLED[name][1]);
    const l = await tx(name, 'Micro/12 Medium', 'text/secondary', 'Name');
    l.textAlignHorizontal = 'CENTER';
    cell.appendChild(l); fillW(l, 1);
  }
}

// ---------- images (3D tile illustrations from the original Home) ----------
function hasImg(n) {
  return 'fills' in n && Array.isArray(n.fills) && n.fills.some(function (f) { return f.type === 'IMAGE' && f.visible !== false; });
}
async function harvestTiles(notes) {
  const LABELS = { consult: 'Consult', lab: 'Lab Tests', vaccine: 'Adult Vaccine', pet: 'Pet Care' };
  for (const id of ['2702:1431', '2703:2255']) {
    const home = await figma.getNodeByIdAsync(id);
    if (!home) continue;
    for (const k of Object.keys(LABELS)) {
      if (IMG[k]) continue;
      const t = home.findOne(function (n) { return n.type === 'TEXT' && n.characters.trim() === LABELS[k]; });
      let scope = t ? t.parent : null, src = null;
      while (scope && !src && scope !== home) {
        if ('findOne' in scope) src = scope.findOne(hasImg);
        scope = scope.parent;
      }
      if (src) {
        const p = src.fills.filter(function (f) { return f.type === 'IMAGE'; })[0];
        IMG[k] = { type: 'IMAGE', imageHash: p.imageHash, scaleMode: 'FIT' };
      }
    }
  }
  for (const k of Object.keys(LABELS)) if (!IMG[k]) notes.push('No 3D illustration found for ' + LABELS[k]);
}

// ---------- components ----------
async function buildStatusPill() {
  const row = await hrow('StatusPill', '24px pill, Micro/12 label on a soft background. Text colours are the *-text tokens, so every pill passes 4.5:1. Override the label text for custom copy ("Due in 3 days").');
  const PILL = {
    'Upcoming': ['brand/primary-soft', 'brand/primary', 'brand/primary'],
    'Completed': ['accent/teal-soft', 'accent/teal', 'accent/teal-text'],
    'Cancelled': ['surface/background', 'text/secondary', 'text/secondary'],
    'Due soon': ['status/warning-soft', 'status/warning', 'status/warning-text'],
    'Overdue': ['status/danger-soft', 'status/danger', 'status/danger-text'],
    'Verified': ['accent/teal-soft', null, 'accent/teal-text'],
  };
  const variants = [];
  for (const k of Object.keys(PILL)) {
    const cfg = PILL[k];
    const c = comp('Status=' + k, 'HORIZONTAL');
    c.counterAxisAlignItems = 'CENTER'; gapV(c, 4); padV(c, 4, 8, 4, 8);
    bindRadius(c, 'pill'); fillV(c, cfg[0]);
    if (k === 'Cancelled') strokeV(c, 'border/subtle', 1);
    if (cfg[1]) {
      const d = figma.createEllipse(); d.name = 'Dot'; d.resize(6, 6); fillV(d, cfg[1]);
      c.appendChild(d);
    } else c.appendChild(ic('Shield Tick', cfg[2], 14));
    c.appendChild(await tx(k, 'Micro/12 Medium', cfg[2], 'Label'));
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'StatusPill'; styleSet(set, 'HORIZONTAL');
  set.description = 'Status: Upcoming / Completed / Cancelled / Due soon / Overdue / Verified.';
  HSET.StatusPill = set;
}

async function buildButton() {
  const row = await hrow('Button', 'L = 52px (Subheading/16), M = 44px (Body/14 Medium), radius/button. Optional leading icon. Danger Ghost is for Cancel-type actions; Danger is for the final destructive confirm.');
  const BTN = {
    'Primary': ['brand/primary', 'text/inverse'],
    'Secondary': ['brand/primary-soft', 'brand/primary'],
    'Ghost': [null, 'brand/primary'],
    'Danger': ['status/danger', 'text/inverse'],
    'Danger Ghost': [null, 'status/danger-text'],
  };
  const variants = [];
  for (const size of ['L', 'M']) {
    for (const style of Object.keys(BTN)) {
      const cfg = BTN[style];
      const c = comp('Style=' + style + ', Size=' + size, 'HORIZONTAL');
      mid(c); gapV(c, 8);
      const px = size === 'L' ? 24 : 20;
      padV(c, 0, px, 0, px);
      c.resize(160, size === 'L' ? 52 : 44); c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'FIXED';
      bindRadius(c, 'button');
      if (cfg[0]) fillV(c, cfg[0]);
      const i = ic('Plus', cfg[1], 20); i.visible = false;
      c.appendChild(i);
      c.appendChild(await tx('Book appointment', size === 'L' ? 'Subheading/16 SemiBold' : 'Body/14 Medium', cfg[1], 'Label'));
      variants.push(c);
    }
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Button'; styleSet(set, 'HORIZONTAL', 1060);
  bindText(set, 'Label', 'Label', 'Book appointment');
  bindBool(set, 'Icon', 'Show icon', false);
  bindSwap(set, 'Icon', 'Icon', 'Plus');
  set.description = 'Style = Primary / Secondary / Ghost / Danger / Danger Ghost; Size = L (52) / M (44).';
  HSET.Button = set;
}

async function buildChip() {
  const row = await hrow('Chip', 'Filters and member/type tabs. 36px pill inside a 44px touch target. Active = navy.');
  const variants = [];
  for (const state of ['Active', 'Inactive']) {
    const on = state === 'Active';
    const c = comp('State=' + state, 'HORIZONTAL');
    padV(c, 4, 0, 4, 0);
    const p = auto('Pill', 'HORIZONTAL');
    mid(p); padV(p, 0, 16, 0, 16);
    p.resize(80, 36); p.primaryAxisSizingMode = 'AUTO'; p.counterAxisSizingMode = 'FIXED';
    bindRadius(p, 'pill');
    if (on) fillV(p, 'brand/primary'); else { fillV(p, 'surface/card'); strokeV(p, 'border/subtle', 1); }
    p.appendChild(await tx('Lab reports', 'Body/14 Medium', on ? 'text/inverse' : 'text/primary', 'Label'));
    c.appendChild(p);
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Chip'; styleSet(set, 'HORIZONTAL');
  bindText(set, 'Label', 'Label', 'Lab reports');
  set.description = 'State = Active (brand/primary + text/inverse) / Inactive (card + border/subtle).';
  HSET.Chip = set;
}

async function buildSegmented() {
  const row = await hrow('Segmented', 'Two-option switch (Upcoming / Past). 44px tall, white segment with soft shadow marks the active side.');
  const variants = [];
  for (const active of ['Left', 'Right']) {
    const c = comp('Active=' + active, 'HORIZONTAL');
    c.counterAxisAlignItems = 'CENTER'; padV(c, 4, 4, 4, 4); gapV(c, 4);
    fixed(c, 353, 44); bindRadius(c, 'pill'); fillV(c, 'brand/primary-soft');
    for (const side of ['Left', 'Right']) {
      const on = side === active;
      const seg = auto(side, 'HORIZONTAL'); mid(seg); bindRadius(seg, 'pill');
      c.appendChild(seg); seg.layoutSizingHorizontal = 'FILL'; seg.layoutSizingVertical = 'FILL';
      if (on) { fillV(seg, 'surface/card'); seg.effects = [SHADOW_CARD]; }
      seg.appendChild(await tx(side === 'Left' ? 'Upcoming' : 'Past', 'Body/14 Medium', on ? 'brand/primary' : 'text/secondary', side + ' label'));
    }
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Segmented'; styleSet(set, 'VERTICAL');
  bindText(set, 'Left label', 'Left', 'Upcoming');
  bindText(set, 'Right label', 'Right', 'Past');
  HSET.Segmented = set;
}

async function buildIconButton() {
  const row = await hrow('IconButton', '40px circle inside a 44px touch target. Plain (app bars), Soft (on background), Primary (navy).');
  const variants = [];
  for (const style of ['Plain', 'Soft', 'Primary']) {
    const c = comp('Style=' + style, 'HORIZONTAL');
    mid(c); fixed(c, 44, 44);
    const cir = circ('Circle', 40, null);
    if (style === 'Soft') { fillV(cir, 'surface/card'); strokeV(cir, 'border/subtle', 1); }
    if (style === 'Primary') fillV(cir, 'brand/primary');
    cir.appendChild(ic('Arrow Left', style === 'Primary' ? 'text/inverse' : 'text/primary', 22));
    c.appendChild(cir);
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'IconButton'; styleSet(set, 'HORIZONTAL');
  bindSwap(set, 'Icon', 'Icon', 'Arrow Left');
  set.description = 'Give every instance an accessibility label in code.';
  HSET.IconButton = set;
}

async function buildAvatar() {
  const row = await hrow('Avatar', 'Initials monogram on a soft tone. For a photo, put an image fill on the instance. Sizes S 32 / M 48 / L 72.');
  const SIZES = { S: [32, 'Micro/12 Medium'], M: [48, 'Subheading/16 SemiBold'], L: [72, 'Title/22 SemiBold'] };
  const TONES = { Navy: ['brand/primary-soft', 'brand/primary'], Teal: ['accent/teal-soft', 'accent/teal-text'], Amber: ['status/warning-soft', 'status/warning-text'] };
  const variants = [];
  for (const s of Object.keys(SIZES)) {
    for (const t of Object.keys(TONES)) {
      const c = comp('Size=' + s + ', Tone=' + t, 'HORIZONTAL');
      mid(c); fixed(c, SIZES[s][0], SIZES[s][0]); bindRadius(c, 'pill'); fillV(c, TONES[t][0]); c.clipsContent = true;
      c.appendChild(await tx('A', SIZES[s][1], TONES[t][1], 'Initials'));
      variants.push(c);
    }
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Avatar'; styleSet(set, 'HORIZONTAL', 560);
  set.counterAxisAlignItems = 'CENTER';
  bindText(set, 'Initials', 'Initials', 'A');
  HSET.Avatar = set;
}

async function buildMember() {
  const row = await hrow('MemberSwitcher', 'MemberChip (Selected = navy ring + navy name), MemberAdd (dashed), and the assembled switcher used on Home.');
  const variants = [];
  for (const state of ['Selected', 'Default']) {
    const on = state === 'Selected';
    const c = comp('State=' + state, 'VERTICAL');
    c.counterAxisAlignItems = 'CENTER'; gapV(c, 4); wFixed(c, 64);
    const ring = circ('Ring', 56, null);
    if (on) strokeV(ring, 'brand/primary', 2);
    const a = avatar('M', 'Navy', 'A');
    ring.appendChild(a);
    c.appendChild(ring);
    a.isExposedInstance = true;
    const n = await tx('Aarav', 'Micro/12 Medium', on ? 'brand/primary' : 'text/secondary', 'Name');
    n.textAlignHorizontal = 'CENTER';
    c.appendChild(n); fillW(n, 1);
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'MemberChip'; styleSet(set, 'HORIZONTAL');
  bindText(set, 'Name', 'Name', 'Aarav');
  HSET.MemberChip = set;

  const st = stage(row);
  const add = comp('MemberAdd', 'VERTICAL');
  add.counterAxisAlignItems = 'CENTER'; gapV(add, 4); wFixed(add, 64);
  const ring = circ('Ring', 56, null);
  const dash = circ('Dashed circle', 48, null);
  strokeV(dash, 'border/strong', 1.5); dash.dashPattern = [4, 3];
  dash.appendChild(ic('Plus', 'text/secondary', 22));
  ring.appendChild(dash); add.appendChild(ring);
  const al = await tx('Add', 'Micro/12 Medium', 'text/secondary', 'Name');
  al.textAlignHorizontal = 'CENTER';
  add.appendChild(al); fillW(al, 1);
  st.appendChild(add);
  HSET.MemberAdd = add;

  const sw = comp('MemberSwitcher', 'HORIZONTAL');
  gapV(sw, 12);
  const MEMBERS = [['Aarav', 'Navy', 'A'], ['Priya', 'Teal', 'P'], ['Kabir', 'Amber', 'K'], ['Sunita', 'Navy', 'S']];
  st.appendChild(sw);
  MEMBERS.forEach(function (m, i) {
    const ch = variant('MemberChip', 'State=' + (i === 0 ? 'Selected' : 'Default'));
    ch.name = 'Member / ' + m[0];
    sw.appendChild(ch);
    setProps(ch, { Name: m[0] });
    const av = ch.findOne(function (n) { return n.type === 'INSTANCE' && n.name === 'Avatar'; });
    setProps(av, { Tone: m[1], Initials: m[2] });
  });
  const addInst = add.createInstance(); addInst.name = 'Add member';
  sw.appendChild(addInst);
  sw.description = 'Home member switcher: Aarav (self, selected), Priya, Kabir, Sunita, + Add.';
  HSET.MemberSwitcher = sw;
}

async function buildQuickAction() {
  const row = await hrow('QuickAction', '80px tile + 12px label (2 lines max). Illustration = the 3D art from the original Home; Icon = linear icon in a soft circle for actions without 3D art.');
  const variants = [];
  for (const type of ['Illustration', 'Icon']) {
    const c = comp('Type=' + type, 'VERTICAL');
    c.counterAxisAlignItems = 'CENTER'; gapV(c, 8); wFixed(c, 80);
    const tile = auto('Tile', 'HORIZONTAL'); mid(tile); fixed(tile, 80, 72);
    cardStyle(tile);
    if (type === 'Illustration') {
      const r = figma.createRectangle(); r.name = 'Illustration'; r.resize(64, 64);
      r.fills = IMG.consult ? [IMG.consult] : [hpaint('brand/primary-soft')];
      tile.appendChild(r);
    } else {
      const cir = circ('Icon circle', 44, 'brand/primary-soft');
      cir.appendChild(ic('Stethoscope', 'brand/primary', 24));
      tile.appendChild(cir);
    }
    c.appendChild(tile);
    const l = await tx('Consult', 'Micro/12 Medium', 'text/primary', 'Label');
    l.textAlignHorizontal = 'CENTER';
    c.appendChild(l); fillW(l, 2);
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'QuickAction'; styleSet(set, 'HORIZONTAL');
  bindText(set, 'Label', 'Label', 'Consult');
  bindSwap(set, 'Icon', 'Icon', 'Stethoscope');
  set.description = 'Home quick action. Illustration variant: swap the image fill on "Illustration".';
  HSET.QuickAction = set;

  // preview of the 4 harvested illustrations
  const st = stage(row);
  const KEYS = [['consult', 'Consult'], ['lab', 'Lab tests'], ['vaccine', 'Vaccines'], ['pet', 'Pet care']];
  for (const k of KEYS) {
    const q = variant('QuickAction', 'Type=Illustration');
    st.appendChild(q);
    setProps(q, { Label: k[1] });
    if (IMG[k[0]]) q.findOne(function (n) { return n.name === 'Illustration'; }).fills = [IMG[k[0]]];
  }
  for (const k of [['Pill', 'Medicines'], ['Upload', 'Upload record'], ['Alarm', 'Reminders'], ['Grid', 'More']]) {
    const q = variant('QuickAction', 'Type=Icon');
    st.appendChild(q);
    setProps(q, { Label: k[1], Icon: HI[k[0]].id });
  }
}

async function buildSearchBar() {
  const row = await hrow('SearchBar', '52px pill. Body/15 placeholder in text/secondary (6.0:1). Opens the search screen; filters live on the results screen.');
  const c = comp('SearchBar', 'HORIZONTAL');
  c.counterAxisAlignItems = 'CENTER'; gapV(c, 12); padV(c, 0, 16, 0, 16); fixed(c, 353, 52);
  bindRadius(c, 'pill'); fillV(c, 'surface/card'); strokeV(c, 'border/subtle', 1);
  c.appendChild(ic('Search', 'text/secondary', 22));
  const p = await tx('Search doctors, tests, medicines, records', 'Body/15 Regular', 'text/secondary', 'Placeholder');
  c.appendChild(p); fillW(p, 1);
  stage(row).appendChild(c);
  bindText(c, 'Placeholder', 'Placeholder', 'Search doctors, tests, medicines, records');
  HSET.SearchBar = c;
}

async function buildSectionHeader() {
  const row = await hrow('SectionHeader + TopBar', 'Section title (Heading/18) with optional "See all" link (44px tall). TopBar: back, centred title, optional action.');
  const st = stage(row);
  st.layoutMode = 'VERTICAL';
  const c = comp('SectionHeader', 'HORIZONTAL');
  c.primaryAxisAlignItems = 'SPACE_BETWEEN'; c.counterAxisAlignItems = 'CENTER'; wFixed(c, 353);
  c.appendChild(await tx('Coming up', 'Heading/18 SemiBold', 'text/primary', 'Title'));
  const link = auto('Link', 'HORIZONTAL'); mid(link);
  link.resize(60, 44); link.primaryAxisSizingMode = 'AUTO'; link.counterAxisSizingMode = 'FIXED';
  link.appendChild(await tx('See all', 'Body/14 Medium', 'brand/primary', 'Link label'));
  c.appendChild(link);
  st.appendChild(c);
  bindText(c, 'Title', 'Title', 'Coming up');
  bindText(c, 'Link label', 'Link', 'See all');
  bindBool(c, 'Link', 'Show link', true);
  HSET.SectionHeader = c;

  const t = comp('TopBar', 'HORIZONTAL');
  t.counterAxisAlignItems = 'CENTER'; gapV(t, 4); padV(t, 0, 8, 0, 8); fixed(t, 393, 56);
  fillV(t, 'surface/background');
  const back = variant('IconButton', 'Style=Plain'); back.name = 'Back';
  t.appendChild(back);
  const title = await tx('Record details', 'Subheading/16 SemiBold', 'text/primary', 'Title');
  title.textAlignHorizontal = 'CENTER';
  t.appendChild(title); fillW(title, 1);
  const act = variant('IconButton', 'Style=Plain'); act.name = 'Action';
  t.appendChild(act);
  setProps(act, { Icon: HI['More'].id });
  st.appendChild(t);
  act.isExposedInstance = true;
  bindText(t, 'Title', 'Title', 'Record details');
  bindBool(t, 'Action', 'Show action', true);
  HSET.TopBar = t;
}

async function buildListRow() {
  const row = await hrow('ListRow', '56px row: icon, Body/15 label, optional value, chevron, divider. ListRow Danger is for Log out / Delete account (last in the list).');
  const st = stage(row);
  st.layoutMode = 'VERTICAL'; st.itemSpacing = 16;
  const c = comp('ListRow', 'HORIZONTAL');
  c.counterAxisAlignItems = 'CENTER'; gapV(c, 12); padV(c, 0, 16, 0, 16); fixed(c, 353, 56);
  fillV(c, 'surface/card');
  c.appendChild(ic('People', 'text/primary', 22));
  const l = await tx('Family members', 'Body/15 Regular', 'text/primary', 'Label');
  c.appendChild(l); fillW(l, 1);
  c.appendChild(await tx('4 members', 'Caption/13 Regular', 'text/secondary', 'Value'));
  const ch = ic('Chevron Right', 'text/secondary', 20); ch.name = 'Chevron';
  c.appendChild(ch);
  const d = figma.createRectangle(); d.name = 'Divider'; d.resize(321, 1); fillV(d, 'border/subtle');
  c.appendChild(d); d.layoutPositioning = 'ABSOLUTE'; d.x = 16; d.y = 55;
  d.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
  st.appendChild(c);
  bindText(c, 'Label', 'Label', 'Family members');
  bindText(c, 'Value', 'Value', '4 members');
  bindBool(c, 'Value', 'Show value', true);
  bindBool(c, 'Chevron', 'Show chevron', true);
  bindBool(c, 'Divider', 'Divider', true);
  bindSwap(c, 'Icon', 'Icon', 'People');
  HSET.ListRow = c;

  const dg = comp('ListRow Danger', 'HORIZONTAL');
  dg.counterAxisAlignItems = 'CENTER'; gapV(dg, 12); padV(dg, 0, 16, 0, 16); fixed(dg, 353, 56);
  fillV(dg, 'surface/card');
  dg.appendChild(ic('Logout', 'status/danger-text', 22));
  const dl = await tx('Log out', 'Body/15 Regular', 'status/danger-text', 'Label');
  dg.appendChild(dl); fillW(dl, 1);
  st.appendChild(dg);
  bindText(dg, 'Label', 'Label', 'Log out');
  bindSwap(dg, 'Icon', 'Icon', 'Logout');
  HSET['ListRow Danger'] = dg;
}

async function buildInput() {
  const row = await hrow('Input + OTPInput', 'Label (Body/14 Medium), 52px field with border/strong (3.3:1), helper or error. OTP: 6 boxes, focused box has a navy border + caret.');
  const variants = [];
  for (const state of ['Default', 'Focused', 'Error']) {
    const c = comp('State=' + state, 'VERTICAL');
    gapV(c, 8); wFixed(c, 353);
    c.appendChild(await tx('Mobile number', 'Body/14 Medium', 'text/primary', 'Label'));
    const f = auto('Field', 'HORIZONTAL');
    f.counterAxisAlignItems = 'CENTER'; gapV(f, 8); padV(f, 0, 16, 0, 16);
    f.resize(353, 52); f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED';
    bindRadius(f, 'button'); fillV(f, 'surface/card');
    strokeV(f, state === 'Focused' ? 'brand/primary' : state === 'Error' ? 'status/danger' : 'border/strong', state === 'Default' ? 1 : 2);
    c.appendChild(f); f.layoutSizingHorizontal = 'FILL';
    const v = await tx('+91 98450 12345', 'Body/15 Regular', 'text/primary', 'Value');
    f.appendChild(v); fillW(v, 1);
    const hr = auto('Helper row', 'HORIZONTAL'); hr.counterAxisAlignItems = 'CENTER'; gapV(hr, 4);
    c.appendChild(hr);
    if (state === 'Error') {
      hr.appendChild(ic('Info', 'status/danger-text', 16));
      hr.appendChild(await tx('Enter a valid 10-digit mobile number', 'Caption/13 Regular', 'status/danger-text', 'Helper'));
    } else {
      hr.appendChild(await tx('We\'ll send a 6-digit code to this number', 'Caption/13 Regular', 'text/secondary', 'Helper'));
    }
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Input'; styleSet(set, 'HORIZONTAL');
  bindText(set, 'Label', 'Label', 'Mobile number');
  bindText(set, 'Value', 'Value', '+91 98450 12345');
  HSET.Input = set;

  const otp = comp('OTPInput', 'HORIZONTAL');
  gapV(otp, 8);
  const digits = ['4', '8', '2', '9', '', ''];
  for (let i = 0; i < 6; i++) {
    const b = auto('Box ' + (i + 1), 'HORIZONTAL'); mid(b); fixed(b, 48, 56);
    bindRadius(b, 'button'); fillV(b, 'surface/card');
    const focused = i === 4;
    strokeV(b, focused ? 'brand/primary' : 'border/strong', focused ? 2 : 1);
    if (digits[i]) b.appendChild(await tx(digits[i], 'Title/22 SemiBold', 'text/primary', 'Digit'));
    else if (focused) {
      const caret = figma.createRectangle(); caret.name = 'Caret'; caret.resize(2, 24); fillV(caret, 'brand/primary');
      b.appendChild(caret);
    }
    otp.appendChild(b);
  }
  stage(row).appendChild(otp);
  HSET.OTPInput = otp;
}

async function buildEmptyState() {
  const row = await hrow('EmptyState', 'Friendly illustration (never the 🚫 icon), Heading/18 title, one sentence of value, primary button directly below. No red hint boxes.');
  const c = comp('EmptyState', 'VERTICAL');
  c.counterAxisAlignItems = 'CENTER'; gapV(c, 16); wFixed(c, 353);
  const ill = circ('Illustration', 160, 'brand/primary-soft');
  ill.appendChild(ic('Folder', 'brand/primary', 72));
  const badge = circ('Badge', 44, 'accent/teal-soft');
  const bi = ic('Plus', 'accent/teal-text', 20); bi.name = 'Badge icon';
  badge.appendChild(bi);
  ill.appendChild(badge);
  badge.layoutPositioning = 'ABSOLUTE'; badge.x = 112; badge.y = 4;
  c.appendChild(ill);
  const copy = auto('Copy', 'VERTICAL'); copy.counterAxisAlignItems = 'CENTER'; gapV(copy, 8);
  c.appendChild(copy);
  const title = await tx('No records yet', 'Heading/18 SemiBold', 'text/primary', 'Title');
  title.textAlignHorizontal = 'CENTER';
  copy.appendChild(title);
  const msg = await tx('Upload prescriptions, lab reports and vaccine certificates to keep them in one place.', 'Body/15 Regular', 'text/secondary', 'Message');
  msg.textAlignHorizontal = 'CENTER'; msg.textAutoResize = 'HEIGHT'; msg.resize(320, msg.height);
  copy.appendChild(msg);
  const b = btn('Primary', 'L', 'Upload a record', 'Upload');
  c.appendChild(b);
  b.isExposedInstance = true;
  stage(row).appendChild(c);
  bindText(c, 'Title', 'Title', 'No records yet');
  bindText(c, 'Message', 'Message', 'Upload prescriptions, lab reports and vaccine certificates to keep them in one place.');
  bindSwap(c, 'Icon', 'Icon', 'Folder');
  bindBool(c, 'Badge', 'Show badge', true);
  HSET.EmptyState = c;
}

async function buildComingUpCard() {
  const row = await hrow('ComingUpCard', 'Home "Coming up": what\'s next for the selected member. Kind = Appointment / Vaccine / Medicine. Date and time in Body/14 Medium text/primary.');
  const KINDS = {
    Appointment: { icon: 'Stethoscope', bg: 'brand/primary-soft', fg: 'brand/primary', title: 'Paediatric check-up', sub: 'Dr. Ananya Rao · Rainbow Children\'s Clinic', member: ['Kabir', 'Amber', 'K'], when: 'Thu, 19 Nov · 4:30 PM', pill: ['Upcoming', null], action: ['Directions', 'Directions'] },
    Vaccine: { icon: 'Syringe', bg: 'status/warning-soft', fg: 'status/warning-text', title: 'MMR vaccine — dose 2', sub: 'Recommended at 4–6 years', member: ['Kabir', 'Amber', 'K'], when: 'Due Fri, 20 Nov', pill: ['Due soon', 'Due in 3 days'], action: ['Book vaccine', 'Calendar'] },
    Medicine: { icon: 'Pill', bg: 'accent/teal-soft', fg: 'accent/teal-text', title: 'Metformin 500 mg', sub: '1 tablet after breakfast', member: ['Sunita', 'Navy', 'S'], when: 'Today · 8:30 AM', pill: ['Upcoming', 'Today'], action: ['Mark as taken', 'Tick'] },
  };
  const variants = [];
  for (const kind of Object.keys(KINDS)) {
    const k = KINDS[kind];
    const c = comp('Kind=' + kind, 'VERTICAL');
    gapV(c, 16); padV(c, 16, 16, 16, 16); wFixed(c, 353); cardStyle(c);
    const head = auto('Header', 'HORIZONTAL'); gapV(head, 12); head.counterAxisAlignItems = 'CENTER';
    c.appendChild(head); head.layoutSizingHorizontal = 'FILL';
    const cir = circ('Icon circle', 44, k.bg);
    cir.appendChild(ic(k.icon, k.fg, 22));
    head.appendChild(cir);
    head.counterAxisAlignItems = 'MIN';
    const col = auto('Text', 'VERTICAL'); gapV(col, 4);
    head.appendChild(col); col.layoutSizingHorizontal = 'FILL';
    // pill sits above the title so the title gets the full width
    const p = pill(k.pill[0], k.pill[1]);
    col.appendChild(p); p.isExposedInstance = true;
    const t = await tx(k.title, 'Subheading/16 SemiBold', 'text/primary', 'Title');
    col.appendChild(t); fillW(t, 2);
    const s = await tx(k.sub, 'Caption/13 Regular', 'text/secondary', 'Subtitle');
    col.appendChild(s); fillW(s, 2);
    const info = auto('Info', 'HORIZONTAL'); gapV(info, 8); info.counterAxisAlignItems = 'CENTER';
    c.appendChild(info);
    const av = avatar('S', k.member[1], k.member[2]);
    info.appendChild(av); av.isExposedInstance = true;
    info.appendChild(await tx(k.member[0], 'Body/14 Medium', 'text/primary', 'Member'));
    info.appendChild(await tx('·', 'Body/14 Medium', 'text/secondary', 'Separator'));
    info.appendChild(ic('Clock', 'text/secondary', 16));
    info.appendChild(await tx(k.when, 'Body/14 Medium', 'text/primary', 'When'));
    const b = btn('Secondary', 'M', k.action[0], k.action[1]);
    c.appendChild(b); b.layoutSizingHorizontal = 'FILL'; b.isExposedInstance = true;
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'ComingUpCard'; styleSet(set, 'HORIZONTAL');
  HSET.ComingUpCard = set;
}

async function buildRecordCard() {
  const row = await hrow('RecordCard', 'Type tile (icon + tint per record type), title, provider, member · date, attachment count, chevron. The whole card is the tap target.');
  const TYPES = {
    'Prescription': ['Prescription', 'brand/primary-soft', 'brand/primary', 'Fever and cough', 'Dr. Ananya Rao · Rainbow Children\'s Clinic', 'Kabir · 12 Nov 2026', '1'],
    'Lab report': ['Flask', 'accent/teal-soft', 'accent/teal-text', 'Complete blood count (CBC)', 'Lal PathLabs, Indiranagar', 'Aarav · 8 Nov 2026', '2'],
    'Scan': ['Scan', 'status/warning-soft', 'status/warning-text', 'Chest X-ray', 'Manipal Hospital, Old Airport Road', 'Sunita · 28 Oct 2026', '3'],
    'Vaccine': ['Syringe', 'accent/teal-soft', 'accent/teal-text', 'MMR vaccine — dose 1', 'Rainbow Children\'s Clinic', 'Kabir · 15 Mar 2022', '1'],
    'Discharge': ['Hospital', 'brand/primary-soft', 'brand/primary', 'Cataract surgery — left eye', 'Narayana Nethralaya, Rajajinagar', 'Sunita · 2 Sep 2026', '4'],
  };
  const variants = [];
  for (const type of Object.keys(TYPES)) {
    const k = TYPES[type];
    const c = comp('Type=' + type, 'HORIZONTAL');
    c.counterAxisAlignItems = 'CENTER'; gapV(c, 12); padV(c, 16, 16, 16, 16); wFixed(c, 353); cardStyle(c);
    const tile = auto('Type tile', 'HORIZONTAL'); mid(tile); fixed(tile, 48, 48); bindRadius(tile, 'button'); fillV(tile, k[1]);
    tile.appendChild(ic(k[0], k[2], 24));
    c.appendChild(tile);
    const col = auto('Text', 'VERTICAL'); gapV(col, 2);
    c.appendChild(col); col.layoutSizingHorizontal = 'FILL';
    col.appendChild(await tx(type, 'Micro/12 Medium', k[2], 'Type label'));
    const t = await tx(k[3], 'Subheading/16 SemiBold', 'text/primary', 'Title');
    col.appendChild(t); fillW(t, 1);
    const pr = await tx(k[4], 'Caption/13 Regular', 'text/secondary', 'Provider');
    col.appendChild(pr); fillW(pr, 1);
    const meta = auto('Meta', 'HORIZONTAL'); gapV(meta, 8); meta.counterAxisAlignItems = 'CENTER';
    col.appendChild(meta);
    meta.appendChild(await tx(k[5], 'Caption/13 Regular', 'text/secondary', 'Member and date'));
    const files = auto('Files', 'HORIZONTAL'); gapV(files, 4); files.counterAxisAlignItems = 'CENTER';
    files.appendChild(ic('Paperclip', 'text/secondary', 14));
    files.appendChild(await tx(k[6], 'Micro/12 Medium', 'text/secondary', 'File count'));
    meta.appendChild(files);
    c.appendChild(ic('Chevron Right', 'text/secondary', 20));
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'RecordCard'; styleSet(set, 'HORIZONTAL', 1160);
  set.description = 'Type = Prescription / Lab report / Scan / Vaccine / Discharge. Override Title, Provider, Member and date, File count.';
  HSET.RecordCard = set;
}

async function buildAppointmentCard() {
  const row = await hrow('AppointmentCard', 'Doctor, specialty, clinic, member; date + time at 16px in a soft panel; status pill. Upcoming: Reschedule (secondary) + Cancel (danger ghost, confirm in a dialog).');
  const variants = [];
  for (const status of ['Upcoming', 'Completed', 'Cancelled']) {
    const c = comp('Status=' + status, 'VERTICAL');
    gapV(c, 16); padV(c, 16, 16, 16, 16); wFixed(c, 353); cardStyle(c);
    const top = auto('Top', 'HORIZONTAL'); gapV(top, 12);
    c.appendChild(top); top.layoutSizingHorizontal = 'FILL';
    const av = avatar('M', 'Navy', 'AR');
    top.appendChild(av); av.isExposedInstance = true;
    const col = auto('Text', 'VERTICAL'); gapV(col, 2);
    top.appendChild(col); col.layoutSizingHorizontal = 'FILL';
    const d = await tx('Dr. Ananya Rao', 'Subheading/16 SemiBold', 'text/primary', 'Doctor');
    col.appendChild(d); fillW(d, 1);
    col.appendChild(await tx('Paediatrician', 'Caption/13 Regular', 'text/secondary', 'Specialty'));
    const cl = await tx('Rainbow Children\'s Clinic, Indiranagar', 'Caption/13 Regular', 'text/secondary', 'Clinic');
    col.appendChild(cl); fillW(cl, 1);
    col.appendChild(await tx('For Kabir', 'Micro/12 Medium', 'brand/primary', 'Member'));
    top.appendChild(pill(status));
    const when = auto('When', 'HORIZONTAL'); gapV(when, 8); when.counterAxisAlignItems = 'CENTER';
    padV(when, 12, 12, 12, 12); bindRadius(when, 'button'); fillV(when, 'surface/background');
    c.appendChild(when); when.layoutSizingHorizontal = 'FILL';
    const off = status === 'Cancelled';
    when.appendChild(ic('Calendar', off ? 'text/secondary' : 'brand/primary', 20));
    const dt = await tx('Thu, 19 Nov', 'Subheading/16 SemiBold', off ? 'text/secondary' : 'text/primary', 'Date');
    when.appendChild(dt);
    when.appendChild(await tx('·', 'Subheading/16 SemiBold', 'text/secondary', 'Separator'));
    when.appendChild(ic('Clock', off ? 'text/secondary' : 'brand/primary', 20));
    const tm = await tx('4:30 PM', 'Subheading/16 SemiBold', off ? 'text/secondary' : 'text/primary', 'Time');
    when.appendChild(tm);
    const actions = auto('Actions', 'HORIZONTAL'); gapV(actions, 12);
    c.appendChild(actions); actions.layoutSizingHorizontal = 'FILL';
    const first = btn('Secondary', 'M', status === 'Upcoming' ? 'Reschedule' : 'Book again');
    actions.appendChild(first); first.layoutSizingHorizontal = 'FILL';
    if (status === 'Upcoming') actions.appendChild(btn('Danger Ghost', 'M', 'Cancel'));
    if (status === 'Completed') actions.appendChild(btn('Ghost', 'M', 'View summary'));
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'AppointmentCard'; styleSet(set, 'HORIZONTAL');
  for (const p of [['Doctor', 'Dr. Ananya Rao'], ['Specialty', 'Paediatrician'], ['Clinic', 'Rainbow Children\'s Clinic, Indiranagar'], ['Member', 'For Kabir'], ['Date', 'Thu, 19 Nov'], ['Time', '4:30 PM']]) {
    bindText(set, p[0], p[0], p[1]);
  }
  HSET.AppointmentCard = set;
}

async function buildDoctorCard() {
  const row = await hrow('DoctorCard', 'Photo/initials, name + Verified, specialty, experience + languages, rating; fee, next available slot (teal text 5.2:1), Book.');
  const c = comp('DoctorCard', 'VERTICAL');
  gapV(c, 16); padV(c, 16, 16, 16, 16); wFixed(c, 353); cardStyle(c);
  const top = auto('Top', 'HORIZONTAL'); gapV(top, 12);
  c.appendChild(top); top.layoutSizingHorizontal = 'FILL';
  const av = avatar('L', 'Teal', 'AR');
  top.appendChild(av); av.isExposedInstance = true;
  const col = auto('Info', 'VERTICAL'); gapV(col, 4);
  top.appendChild(col); col.layoutSizingHorizontal = 'FILL';
  const nr = auto('Name row', 'HORIZONTAL'); gapV(nr, 8); nr.counterAxisAlignItems = 'CENTER';
  col.appendChild(nr); nr.layoutSizingHorizontal = 'FILL';
  const docName = await tx('Dr. Ananya Rao', 'Subheading/16 SemiBold', 'text/primary', 'Name');
  nr.appendChild(docName); fillW(docName, 1); // long names truncate instead of pushing the pill out
  nr.appendChild(pill('Verified'));
  col.appendChild(await tx('Paediatrician', 'Caption/13 Regular', 'text/secondary', 'Specialty'));
  const ex = await tx('12 yrs exp · English, Hindi, Kannada', 'Caption/13 Regular', 'text/secondary', 'Experience');
  col.appendChild(ex); fillW(ex, 1);
  const rr = auto('Rating', 'HORIZONTAL'); gapV(rr, 4); rr.counterAxisAlignItems = 'CENTER';
  col.appendChild(rr);
  rr.appendChild(ic('Star Filled', null, 16));
  rr.appendChild(await tx('4.8', 'Body/14 Medium', 'text/primary', 'Rating value'));
  rr.appendChild(await tx('(312 reviews)', 'Caption/13 Regular', 'text/secondary', 'Reviews'));
  divider(c);
  const bottom = auto('Bottom', 'HORIZONTAL'); gapV(bottom, 12); bottom.counterAxisAlignItems = 'CENTER';
  c.appendChild(bottom); bottom.layoutSizingHorizontal = 'FILL';
  const fee = auto('Fee', 'VERTICAL'); gapV(fee, 2);
  fee.appendChild(await tx('₹600', 'Subheading/16 SemiBold', 'text/primary', 'Fee value'));
  fee.appendChild(await tx('Consultation fee', 'Micro/12 Medium', 'text/secondary', 'Fee label'));
  bottom.appendChild(fee);
  const next = auto('Next', 'VERTICAL'); gapV(next, 2);
  bottom.appendChild(next); next.layoutSizingHorizontal = 'FILL';
  next.appendChild(await tx('Next available', 'Micro/12 Medium', 'text/secondary', 'Next label'));
  next.appendChild(await tx('4:30 PM today', 'Body/14 Medium', 'accent/teal-text', 'Next slot'));
  const b = btn('Primary', 'M', 'Book');
  bottom.appendChild(b); b.isExposedInstance = true;
  stage(row).appendChild(c);
  for (const p of [['Name', 'Dr. Ananya Rao'], ['Specialty', 'Paediatrician'], ['Experience', '12 yrs exp · English, Hindi, Kannada'], ['Rating value', '4.8'], ['Reviews', '(312 reviews)'], ['Fee value', '₹600'], ['Next slot', '4:30 PM today']]) {
    bindText(c, p[0], p[0], p[1]);
  }
  HSET.DoctorCard = c;
}

async function tag(text, iconName, bg, fg, name) {
  const t = auto(name, 'HORIZONTAL'); t.counterAxisAlignItems = 'CENTER'; gapV(t, 4); padV(t, 4, 8, 4, 8);
  bindRadius(t, 'pill'); fillV(t, bg);
  t.appendChild(ic(iconName, fg, 14));
  t.appendChild(await tx(text, 'Micro/12 Medium', fg, 'Tag label'));
  return t;
}

async function buildLabPackageCard() {
  const row = await hrow('LabPackageCard', '264px card for horizontal rows: home collection + NABL tags, name, tests count, report time, ₹ price with MRP struck through and % off.');
  const c = comp('LabPackageCard', 'VERTICAL');
  gapV(c, 12); padV(c, 16, 16, 16, 16); wFixed(c, 264); cardStyle(c);
  const tags = auto('Tags', 'HORIZONTAL'); gapV(tags, 8);
  c.appendChild(tags);
  tags.appendChild(await tag('Home collection', 'Home', 'accent/teal-soft', 'accent/teal-text', 'Home collection'));
  tags.appendChild(await tag('NABL lab', 'Shield Tick', 'brand/primary-soft', 'brand/primary', 'NABL'));
  const n = await tx('Full body checkup', 'Heading/18 SemiBold', 'text/primary', 'Name');
  c.appendChild(n); fillW(n, 2);
  const det = auto('Details', 'VERTICAL'); gapV(det, 4);
  c.appendChild(det);
  for (const d of [['Flask', '72 tests included', 'Tests'], ['Clock', 'Report in 24 h', 'Report time']]) {
    const l = auto(d[2] + ' row', 'HORIZONTAL'); gapV(l, 8); l.counterAxisAlignItems = 'CENTER';
    l.appendChild(ic(d[0], 'text/secondary', 16));
    l.appendChild(await tx(d[1], 'Caption/13 Regular', 'text/secondary', d[2]));
    det.appendChild(l);
  }
  divider(c);
  const foot = auto('Footer', 'HORIZONTAL'); foot.primaryAxisAlignItems = 'SPACE_BETWEEN'; foot.counterAxisAlignItems = 'CENTER';
  c.appendChild(foot); foot.layoutSizingHorizontal = 'FILL';
  const price = auto('Price', 'VERTICAL'); gapV(price, 2);
  price.appendChild(await tx('₹1,299', 'Heading/18 SemiBold', 'text/primary', 'Price value'));
  const mrpRow = auto('MRP row', 'HORIZONTAL'); gapV(mrpRow, 4); mrpRow.counterAxisAlignItems = 'CENTER';
  const mrp = await tx('₹2,999', 'Caption/13 Regular', 'text/secondary', 'MRP');
  mrp.textDecoration = 'STRIKETHROUGH';
  mrpRow.appendChild(mrp);
  mrpRow.appendChild(await tx('57% off', 'Micro/12 Medium', 'accent/teal-text', 'Discount'));
  price.appendChild(mrpRow);
  foot.appendChild(price);
  const b = btn('Primary', 'M', 'Book');
  foot.appendChild(b); b.isExposedInstance = true;
  stage(row).appendChild(c);
  for (const p of [['Name', 'Full body checkup'], ['Tests', '72 tests included'], ['Report time', 'Report in 24 h'], ['Price value', '₹1,299'], ['MRP', '₹2,999'], ['Discount', '57% off']]) {
    bindText(c, p[0], p[0], p[1]);
  }
  mrp.textDecoration = 'STRIKETHROUGH'; // again: bindText resets text decoration
  bindBool(c, 'Home collection', 'Home collection', true);
  HSET.LabPackageCard = c;
}

async function buildSlots() {
  const row = await hrow('SlotPicker', 'DayPill (46×64) and TimeSlot (112×44): Default / Selected (navy) / Disabled (50% opacity + border; no strikethrough, because variants sharing a text property share its styling). Assembled picker: 7-day strip + Morning / Afternoon / Evening. 17 Nov 2026 is a Tuesday.');
  const dv = [];
  for (const state of ['Default', 'Selected', 'Disabled']) {
    const c = comp('State=' + state, 'VERTICAL');
    mid(c); gapV(c, 4); fixed(c, 46, 64); bindRadius(c, 'button');
    const sel = state === 'Selected', off = state === 'Disabled';
    if (sel) fillV(c, 'brand/primary');
    else if (off) { fillV(c, 'surface/background'); strokeV(c, 'border/subtle', 1); c.opacity = 0.5; }
    else { fillV(c, 'surface/card'); strokeV(c, 'border/subtle', 1); }
    c.appendChild(await tx('Thu', 'Micro/12 Medium', sel ? 'text/inverse' : 'text/secondary', 'Day'));
    const dt = await tx('19', 'Subheading/16 SemiBold', sel ? 'text/inverse' : off ? 'text/secondary' : 'text/primary', 'Date');
    c.appendChild(dt);
    dv.push(c);
  }
  const dset = figma.combineAsVariants(dv, row);
  dset.name = 'DayPill'; styleSet(dset, 'HORIZONTAL');
  bindText(dset, 'Day', 'Day', 'Thu');
  bindText(dset, 'Date', 'Date', '19');
  HSET.DayPill = dset;

  const tv = [];
  for (const state of ['Default', 'Selected', 'Disabled']) {
    const c = comp('State=' + state, 'HORIZONTAL');
    mid(c); fixed(c, 112, 44); bindRadius(c, 'button');
    const sel = state === 'Selected', off = state === 'Disabled';
    if (sel) fillV(c, 'brand/primary');
    else if (off) { fillV(c, 'surface/background'); strokeV(c, 'border/subtle', 1); c.opacity = 0.5; }
    else { fillV(c, 'surface/card'); strokeV(c, 'border/subtle', 1); }
    const t = await tx('4:30 PM', 'Body/14 Medium', sel ? 'text/inverse' : off ? 'text/secondary' : 'text/primary', 'Time');
    c.appendChild(t);
    tv.push(c);
  }
  const tset = figma.combineAsVariants(tv, row);
  tset.name = 'TimeSlot'; styleSet(tset, 'HORIZONTAL');
  bindText(tset, 'Time', 'Time', '4:30 PM');
  HSET.TimeSlot = tset;

  const c = comp('SlotPicker', 'VERTICAL');
  gapV(c, 20); wFixed(c, 353);
  c.appendChild(await tx('November 2026', 'Subheading/16 SemiBold', 'text/primary', 'Month'));
  const strip = auto('Days', 'HORIZONTAL'); strip.primaryAxisAlignItems = 'SPACE_BETWEEN';
  c.appendChild(strip); strip.layoutSizingHorizontal = 'FILL';
  const DAYS = [['Tue', '17', 'Default'], ['Wed', '18', 'Default'], ['Thu', '19', 'Selected'], ['Fri', '20', 'Default'], ['Sat', '21', 'Default'], ['Sun', '22', 'Disabled'], ['Mon', '23', 'Default']];
  for (const d of DAYS) {
    const p = variant('DayPill', 'State=' + d[2]);
    strip.appendChild(p);
    setProps(p, { Day: d[0], Date: d[1] });
  }
  const GROUPS = [
    ['Morning', [['9:00 AM', 'Default'], ['9:30 AM', 'Default'], ['10:00 AM', 'Disabled'], ['10:30 AM', 'Default'], ['11:00 AM', 'Disabled'], ['11:30 AM', 'Default']]],
    ['Afternoon', [['12:30 PM', 'Default'], ['2:00 PM', 'Default'], ['2:30 PM', 'Disabled'], ['3:00 PM', 'Default']]],
    ['Evening', [['4:30 PM', 'Selected'], ['5:00 PM', 'Default'], ['5:30 PM', 'Default'], ['6:00 PM', 'Disabled']]],
  ];
  for (const g of GROUPS) {
    const gf = auto(g[0], 'VERTICAL'); gapV(gf, 8);
    c.appendChild(gf); gf.layoutSizingHorizontal = 'FILL';
    gf.appendChild(await tx(g[0], 'Body/14 Medium', 'text/secondary', 'Group label'));
    const grid = auto('Slots', 'HORIZONTAL');
    gf.appendChild(grid); grid.layoutSizingHorizontal = 'FILL';
    grid.layoutWrap = 'WRAP'; grid.itemSpacing = 8; grid.counterAxisSpacing = 8;
    for (const s of g[1]) {
      const ts = variant('TimeSlot', 'State=' + s[1]);
      grid.appendChild(ts);
      setProps(ts, { Time: s[0] });
    }
  }
  stage(row).appendChild(c);
  HSET.SlotPicker = c;
}

async function buildNavBar() {
  const row = await hrow('NavBar', 'Floating white bar (radius/sheet, soft shadow). Every tab has icon + label; active = navy pill behind a white icon and a navy label. Tabs 72×56.');
  const TABS = [['Home', 'Home'], ['Records', 'Document'], ['Bookings', 'Calendar Tick'], ['Profile', 'User']];
  const variants = [];
  for (const active of ['Home', 'Records', 'Bookings', 'Profile']) {
    const c = comp('Active=' + active, 'HORIZONTAL');
    c.primaryAxisAlignItems = 'SPACE_BETWEEN'; c.counterAxisAlignItems = 'CENTER';
    padV(c, 8, 12, 8, 12); fixed(c, 353, 72);
    bindRadius(c, 'sheet'); fillV(c, 'surface/card'); strokeV(c, 'border/subtle', 1); c.effects = [SHADOW_FLOAT];
    for (const tab of TABS) {
      const on = tab[0] === active;
      const t = auto('Tab / ' + tab[0], 'VERTICAL');
      mid(t); gapV(t, 4); fixed(t, 72, 56);
      const p = auto('Icon pill', 'HORIZONTAL'); mid(p); fixed(p, 56, 32); bindRadius(p, 'pill');
      if (on) fillV(p, 'brand/primary');
      p.appendChild(ic(tab[1], on ? 'text/inverse' : 'text/secondary', 22));
      t.appendChild(p);
      t.appendChild(await tx(tab[0], 'Micro/12 Medium', on ? 'brand/primary' : 'text/secondary', 'Label'));
      c.appendChild(t);
    }
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'NavBar'; styleSet(set, 'HORIZONTAL', 780);
  set.description = 'Bottom tabs: Home, Records, Bookings, Profile. Floats 12px above the home indicator.';
  HSET.NavBar = set;
}

async function buildFeedback() {
  const row = await hrow('Toast + ConfirmDialog', 'Toast: dark, 353 wide, short message + one action. ConfirmDialog: destructive confirm with a danger icon, plain-language consequence, Keep / Delete.');
  const variants = [];
  for (const type of ['Success', 'Error']) {
    const ok = type === 'Success';
    const c = comp('Type=' + type, 'HORIZONTAL');
    c.counterAxisAlignItems = 'CENTER'; gapV(c, 12); padV(c, 12, 16, 12, 16); wFixed(c, 353);
    bindRadius(c, 'button'); fillV(c, 'text/primary'); c.effects = [SHADOW_FLOAT];
    c.appendChild(ic(ok ? 'Tick Circle' : 'Warning', ok ? 'accent/teal' : 'status/danger-soft', 22));
    const m = await tx(ok ? 'Record uploaded' : 'Couldn\'t upload. Check your connection.', 'Body/14 Medium', 'text/inverse', 'Message');
    c.appendChild(m); fillW(m, 2);
    const a = auto('Action', 'HORIZONTAL'); mid(a); a.resize(48, 44); a.counterAxisSizingMode = 'FIXED';
    a.appendChild(await tx(ok ? 'View' : 'Retry', 'Body/14 Medium', 'brand/primary-soft', 'Action label'));
    c.appendChild(a);
    variants.push(c);
  }
  const set = figma.combineAsVariants(variants, row);
  set.name = 'Toast'; styleSet(set, 'VERTICAL');
  HSET.Toast = set;

  const d = comp('ConfirmDialog', 'VERTICAL');
  d.counterAxisAlignItems = 'CENTER'; gapV(d, 16); padV(d, 24, 24, 24, 24); wFixed(d, 329);
  bindRadius(d, 'sheet'); fillV(d, 'surface/card'); d.effects = [SHADOW_FLOAT];
  const cir = circ('Icon circle', 56, 'status/danger-soft');
  cir.appendChild(ic('Trash', 'status/danger-text', 26));
  d.appendChild(cir);
  const t = await tx('Delete this record?', 'Heading/18 SemiBold', 'text/primary', 'Title');
  t.textAlignHorizontal = 'CENTER';
  d.appendChild(t); fillW(t);
  const m = await tx('This removes the record and its files from HealthHub. You can\'t undo this.', 'Body/15 Regular', 'text/secondary', 'Message');
  m.textAlignHorizontal = 'CENTER';
  d.appendChild(m); fillW(m);
  const actions = auto('Actions', 'HORIZONTAL'); gapV(actions, 12);
  d.appendChild(actions); actions.layoutSizingHorizontal = 'FILL';
  const keep = btn('Secondary', 'M', 'Keep it');
  actions.appendChild(keep); keep.layoutSizingHorizontal = 'FILL'; keep.isExposedInstance = true;
  const del = btn('Danger', 'M', 'Delete');
  actions.appendChild(del); del.layoutSizingHorizontal = 'FILL'; del.isExposedInstance = true;
  stage(row).appendChild(d);
  bindText(d, 'Title', 'Title', 'Delete this record?');
  bindText(d, 'Message', 'Message', 'This removes the record and its files from HealthHub. You can\'t undo this.');
  HSET.ConfirmDialog = d;
}

// A section can be rebuilt only while nothing outside it uses its components.
async function freeSectionSpot(page, name) {
  const old = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === name; })[0];
  if (!old) return null;
  const comps = old.findAll(function (n) { return n.type === 'COMPONENT'; });
  for (const c of comps) {
    const insts = await c.getInstancesAsync();
    for (const i of insts) {
      let p = i.parent, inside = false;
      while (p) { if (p === old) { inside = true; break; } p = p.parent; }
      if (!inside) throw new Error('"' + name + '" is already used on other frames (' + c.name + '), so A3 won\'t rebuild it.');
    }
  }
  const pos = { x: old.x, y: old.y };
  old.remove();
  return pos;
}

async function runA3() {
  const root = await figma.getNodeByIdAsync(ROOT_ID);
  if (!root) throw new Error('Node ' + ROOT_ID + ' not found. Open the "Web designs" file first.');
  let page = root; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();

  const NAME = 'HealthHub / Components';
  let pos = await freeSectionSpot(page, NAME);
  if (!pos) {
    const tokens = page.children.filter(function (n) { return n.name === 'HealthHub / Tokens'; })[0];
    if (tokens) pos = { x: Math.round(tokens.x + tokens.width + 240), y: Math.round(tokens.y) };
    else { const rb = root.absoluteBoundingBox; pos = { x: Math.round(rb.x + rb.width + 1800), y: Math.round(rb.y) }; }
  }

  const before = {};
  for (const n of page.children) before[n.id] = true;
  const notes = [];
  const section = figma.createSection();
  section.name = NAME;
  page.appendChild(section);
  section.x = pos.x; section.y = pos.y;
  try {
    hboard = auto('Components board', 'VERTICAL');
    hboard.itemSpacing = 64;
    hboard.paddingTop = 56; hboard.paddingBottom = 56; hboard.paddingLeft = 56; hboard.paddingRight = 56;
    hboard.fills = [hpaint('surface/card')];
    bindRadius(hboard, 'sheet');
    section.appendChild(hboard);
    hboard.x = 0; hboard.y = 0;
    const title = await tx('HealthHub components', 'Display/28 Bold', 'text/primary', 'Board title');
    hboard.appendChild(title);

    await harvestTiles(notes);
    await buildIcons();
    await buildStatusPill();
    await buildButton();
    await buildChip();
    await buildSegmented();
    await buildIconButton();
    await buildAvatar();
    await buildMember();
    await buildQuickAction();
    await buildSearchBar();
    await buildSectionHeader();
    await buildListRow();
    await buildInput();
    await buildEmptyState();
    await buildComingUpCard();
    await buildRecordCard();
    await buildAppointmentCard();
    await buildDoctorCard();
    await buildLabPackageCard();
    await buildSlots();
    await buildNavBar();
    await buildFeedback();

    section.resizeWithoutConstraints(hboard.width, hboard.height);
    figma.currentPage.selection = [section];
    figma.viewport.scrollAndZoomIntoView([section]);
  } catch (e) {
    section.remove();
    for (const n of page.children.slice()) if (!before[n.id] && !n.removed) n.remove();
    throw e;
  }

  const pngs = [];
  for (const r of ROWS) {
    const scale = r[0] === 'Icons' ? 2 : 1.5;
    pngs.push({ slug: 'a3-' + slug(r[0]), bytes: await r[1].exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } }) });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    section: { id: section.id, x: section.x, y: section.y, w: section.width, h: section.height },
    icons: Object.keys(HI),
    images: Object.keys(IMG),
    notes: notes,
    components: Object.keys(HSET).map(function (k) {
      const n = HSET[k];
      return {
        name: k, id: n.id, type: n.type,
        variants: n.type === 'COMPONENT_SET' ? n.children.map(function (c) { return c.name; }) : null,
        props: Object.keys(n.componentPropertyDefinitions || {}).map(function (p) { return p.split('#')[0] + ':' + n.componentPropertyDefinitions[p].type; }),
      };
    }),
  };
  await upload('a3-components', report, pngs);
  return '✓ A3 done: ' + Object.keys(HSET).length + ' components + ' + Object.keys(HI).length + ' icons in "' + NAME + '". Screens not changed.' + (notes.length ? ' Notes: ' + notes.join('; ') : '');
}

// =====================================================================
// A4 · Rebuild the existing screens
// =====================================================================

const SW = 393, SH = 852;
const NOTES4 = [];
const A4_SCREENS = [
  // [key, original node id, new frame name, builder name]
  ['Home', '2702:1431', 'HealthHub / Home', 'buildHome'],
  ['Family', '2707:1360', 'HealthHub / Family', 'buildFamily'],
  ['Records empty', '2707:1478', 'HealthHub / Records / Empty', 'buildRecordsEmpty'],
  ['Records', '2707:2385', 'HealthHub / Records', 'buildRecords'],
  ['Bookings empty', '2707:1596', 'HealthHub / Bookings / Empty', 'buildBookingsEmpty'],
  ['Bookings', '2709:1606', 'HealthHub / Bookings', 'buildBookings'],
  ['Profile', '2712:1574', 'HealthHub / Profile', 'buildProfile'],
];
const A4_ARCHIVE_ONLY = [['Homepage / Version 2', '2703:2255'], ['Settings version 2', '2712:2083']];

async function loadA3(page) {
  const sec = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / Components'; })[0];
  if (!sec) throw new Error('No "HealthHub / Components" section. Run A3 first.');
  sec.findAll(function (n) {
    return n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET');
  }).forEach(function (n) {
    if (n.name.indexOf('Icon/') === 0) HI[n.name.slice(5)] = n; else HSET[n.name] = n;
  });
  const need = ['StatusPill', 'Button', 'Chip', 'Segmented', 'IconButton', 'Avatar', 'MemberSwitcher', 'QuickAction', 'SearchBar',
    'SectionHeader', 'TopBar', 'ListRow', 'ListRow Danger', 'EmptyState', 'ComingUpCard', 'RecordCard', 'AppointmentCard',
    'LabPackageCard', 'NavBar'];
  const missing = need.filter(function (n) { return !HSET[n]; });
  if (missing.length) throw new Error('Components missing (re-run A3): ' + missing.join(', '));
}

// 3D tile art: from the original Home, or its archive copy on a re-run
async function harvestFrom(nodes) {
  const LABELS = { consult: 'Consult', lab: 'Lab Tests', vaccine: 'Adult Vaccine', pet: 'Pet Care' };
  for (const home of nodes) {
    if (!home) continue;
    for (const k of Object.keys(LABELS)) {
      if (IMG[k]) continue;
      const t = home.findOne(function (n) { return n.type === 'TEXT' && n.characters.trim() === LABELS[k]; });
      let scope = t ? t.parent : null, src = null;
      while (scope && !src && scope !== home) {
        if ('findOne' in scope) src = scope.findOne(hasImg);
        scope = scope.parent;
      }
      if (src) {
        const p = src.fills.filter(function (f) { return f.type === 'IMAGE'; })[0];
        IMG[k] = { type: 'IMAGE', imageHash: p.imageHash, scaleMode: 'FIT' };
      }
    }
  }
  for (const k of Object.keys(LABELS)) if (!IMG[k]) NOTES4.push('No 3D art for ' + LABELS[k] + ' (icon tile used).');
}

// ---------- screen helpers ----------
function shell(f) {
  f.layoutMode = 'VERTICAL';
  f.resize(SW, SH);
  f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED';
  f.primaryAxisAlignItems = 'MIN'; f.counterAxisAlignItems = 'MIN';
  f.paddingTop = 0; f.paddingBottom = 0; f.paddingLeft = 0; f.paddingRight = 0;
  f.itemSpacing = 0;
  fillV(f, 'surface/background');
  f.strokes = []; f.effects = []; f.cornerRadius = 0;
  f.clipsContent = true;
  try { f.overflowDirection = 'VERTICAL'; } catch (e) { /* prototype-only */ }
}
function screenX(n) {
  n.paddingLeft = 20; n.paddingRight = 20;
  n.setBoundVariable('paddingLeft', HV['space/screen']); n.setBoundVariable('paddingRight', HV['space/screen']);
}
// flow column with 20px screen padding
function content(f, name, top, bottom, spacing) {
  const c = auto(name, 'VERTICAL');
  f.appendChild(c); c.layoutSizingHorizontal = 'FILL';
  screenX(c); sp(c, 'paddingTop', top); sp(c, 'paddingBottom', bottom);
  gapV(c, spacing);
  return c;
}
function put(parent, node, fill) {
  parent.appendChild(node);
  if (fill) node.layoutSizingHorizontal = 'FILL';
  return node;
}
function absolute(f, node, x, y, constraints) {
  f.appendChild(node);
  node.layoutPositioning = 'ABSOLUTE';
  node.x = x; node.y = y;
  if (constraints) node.constraints = constraints;
  try { node.scrollBehavior = 'FIXED'; } catch (e) { /* older API */ }
  return node;
}
function addChrome(f, active) {
  // fade so content scrolling under the floating nav stays calm
  const fade = figma.createRectangle();
  fade.name = 'Nav fade'; fade.resize(SW, 140);
  const bg = { r: 246 / 255, g: 247 / 255, b: 251 / 255 };
  fade.fills = [{
    type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]],
    gradientStops: [
      { position: 0, color: { r: bg.r, g: bg.g, b: bg.b, a: 0 } },
      { position: 0.45, color: { r: bg.r, g: bg.g, b: bg.b, a: 1 } },
      { position: 1, color: { r: bg.r, g: bg.g, b: bg.b, a: 1 } },
    ],
  }];
  absolute(f, fade, 0, SH - 140, { horizontal: 'STRETCH', vertical: 'MAX' });
  if (active) {
    const nav = variant('NavBar', 'Active=' + active); nav.name = 'NavBar';
    absolute(f, nav, 20, SH - 72 - 20, { horizontal: 'CENTER', vertical: 'MAX' });
  }
  const ind = figma.createRectangle();
  ind.name = 'Home indicator'; ind.resize(134, 5); bindRadius(ind, 'pill'); fillV(ind, 'text/primary');
  absolute(f, ind, (SW - 134) / 2, SH - 8 - 5, { horizontal: 'CENTER', vertical: 'MAX' });
}
function setText(inst, layer, value) {
  const t = inst.findOne(function (n) { return n.type === 'TEXT' && n.name === layer; });
  if (!t) throw new Error(inst.name + ': no text layer "' + layer + '"');
  t.characters = value;
}
function exposed(inst, name) {
  const e = (inst.exposedInstances || []).filter(function (n) { return n.name === name; })[0];
  if (!e) throw new Error(inst.name + ': no exposed instance "' + name + '"');
  return e;
}
async function tabHeader(parent, title, iconName) {
  const row = auto('Header', 'HORIZONTAL');
  row.primaryAxisAlignItems = 'SPACE_BETWEEN'; row.counterAxisAlignItems = 'CENTER';
  put(parent, row, true);
  row.appendChild(await tx(title, 'Display/28 Bold', 'text/primary', 'Title'));
  if (iconName) {
    const b = variant('IconButton', 'Style=Soft'); b.name = iconName;
    setProps(b, { Icon: HI[iconName].id });
    row.appendChild(b);
  }
  return row;
}
function sectionHead(parent, title, link) {
  const h = HSET.SectionHeader.createInstance(); h.name = 'SectionHeader / ' + title;
  put(parent, h, true);
  setProps(h, { Title: title, 'Show link': !!link });
  if (link) setProps(h, { Link: link });
  return h;
}
function block(parent, name, spacing) {
  const b = auto(name, 'VERTICAL'); gapV(b, spacing || 12);
  put(parent, b, true);
  return b;
}
function hScroll(parent, name, spacing) {
  const r = auto(name, 'HORIZONTAL'); gapV(r, spacing || 8);
  parent.appendChild(r); // hugs its children and runs off the right edge like a carousel
  return r;
}
function chip(label, active) {
  const c = variant('Chip', 'State=' + (active ? 'Active' : 'Inactive'));
  c.name = 'Chip / ' + label;
  return setProps(c, { Label: label });
}
async function monthLabel(parent, text) {
  parent.appendChild(await tx(text, 'Body/14 Medium', 'text/secondary', 'Month'));
}
function emptyBody(f) {
  const body = auto('Body', 'VERTICAL');
  f.appendChild(body);
  body.layoutSizingHorizontal = 'FILL'; body.layoutSizingVertical = 'FILL';
  mid(body); screenX(body);
  body.paddingBottom = 112; // clears the floating nav
  return body;
}

// ---------- screens ----------
async function buildHome(f) {
  shell(f);
  const c = content(f, 'Content', 8, 136, 24);

  const head = auto('Greeting', 'HORIZONTAL');
  head.primaryAxisAlignItems = 'SPACE_BETWEEN'; head.counterAxisAlignItems = 'CENTER'; gapV(head, 12);
  put(c, head, true);
  const g = auto('Text', 'VERTICAL'); gapV(g, 4);
  put(head, g, true);
  g.appendChild(await tx('Good morning, Aarav', 'Title/22 SemiBold', 'text/primary', 'Greeting'));
  const sub = await tx('Here\'s what\'s coming up for your family.', 'Body/15 Regular', 'text/secondary', 'Subtitle');
  g.appendChild(sub); fillW(sub, 2);
  const bellWrap = figma.createFrame();
  bellWrap.name = 'Notifications (1 unread)'; bellWrap.resize(44, 44); bellWrap.fills = []; bellWrap.clipsContent = false;
  const bell = variant('IconButton', 'Style=Soft'); bell.name = 'Bell';
  setProps(bell, { Icon: HI.Bell.id });
  bellWrap.appendChild(bell); bell.x = 0; bell.y = 0;
  const dot = figma.createEllipse(); dot.name = 'Unread dot'; dot.resize(10, 10);
  fillV(dot, 'status/danger'); strokeV(dot, 'surface/card', 2); dot.strokeAlign = 'OUTSIDE';
  bellWrap.appendChild(dot); dot.x = 29; dot.y = 6;
  head.appendChild(bellWrap);

  const sw = HSET.MemberSwitcher.createInstance(); sw.name = 'MemberSwitcher (Kabir selected)';
  c.appendChild(sw);
  setProps(sw.findOne(function (n) { return n.type === 'INSTANCE' && n.name === 'Member / Aarav'; }), { State: 'Default' });
  setProps(sw.findOne(function (n) { return n.type === 'INSTANCE' && n.name === 'Member / Kabir'; }), { State: 'Selected' });

  const sb = HSET.SearchBar.createInstance(); sb.name = 'SearchBar';
  put(c, sb, true);

  const qa = block(c, 'Quick actions', 16);
  const QA = [[['consult', 'Consult'], ['lab', 'Lab tests'], ['vaccine', 'Vaccines'], ['Pill', 'Medicines']],
    [['Upload', 'Upload record'], ['Alarm', 'Reminders'], ['pet', 'Pet care'], ['Grid', 'More']]];
  for (const rowDef of QA) {
    const r = auto('Row', 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN';
    put(qa, r, true);
    for (const a of rowDef) {
      const art = IMG[a[0]];
      const q = variant('QuickAction', 'Type=' + (art ? 'Illustration' : 'Icon'));
      q.name = 'QuickAction / ' + a[1];
      r.appendChild(q);
      setProps(q, { Label: a[1] });
      if (art) q.findOne(function (n) { return n.name === 'Illustration'; }).fills = [art];
      else {
        const FALLBACK = { consult: 'Stethoscope', lab: 'Flask', vaccine: 'Syringe', pet: 'Paw' };
        setProps(q, { Icon: HI[FALLBACK[a[0]] || a[0]].id });
      }
    }
  }

  const up = block(c, 'Coming up', 12);
  sectionHead(up, 'Coming up for Kabir', 'See all');
  put(up, variant('ComingUpCard', 'Kind=Appointment'), true);
  put(up, variant('ComingUpCard', 'Kind=Vaccine'), true);

  const rec = block(c, 'Recent records', 12);
  sectionHead(rec, 'Kabir\'s records', 'See all');
  put(rec, variant('RecordCard', 'Type=Prescription'), true);
  put(rec, variant('RecordCard', 'Type=Vaccine'), true);

  const labs = block(c, 'Popular lab packages', 12);
  sectionHead(labs, 'Popular lab packages', 'See all');
  const row = hScroll(labs, 'Packages', 12);
  const PK = [
    null,
    { Name: 'Diabetes care', Tests: '28 tests included', 'Report time': 'Report in 24 h', 'Price value': '₹899', MRP: '₹1,999', Discount: '55% off' },
    { Name: 'Thyroid profile', Tests: '3 tests included', 'Report time': 'Report in 12 h', 'Price value': '₹499', MRP: '₹999', Discount: '50% off' },
  ];
  for (const p of PK) {
    const card = HSET.LabPackageCard.createInstance(); card.name = 'LabPackageCard / ' + (p ? p.Name : 'Full body checkup');
    row.appendChild(card);
    if (p) setProps(card, p);
  }

  const promo = block(c, 'Promo carousel', 12);
  promo.counterAxisAlignItems = 'CENTER';
  const pc = auto('Promo / Lab reports', 'HORIZONTAL');
  pc.counterAxisAlignItems = 'CENTER'; gapV(pc, 12); padV(pc, 16, 16, 16, 16);
  bindRadius(pc, 'card'); fillV(pc, 'accent/teal-soft');
  put(promo, pc, true);
  const pt = auto('Text', 'VERTICAL'); gapV(pt, 4);
  put(pc, pt, true);
  pt.appendChild(await tx('Lab reports in 24 hours', 'Subheading/16 SemiBold', 'text/primary', 'Title'));
  const pm = await tx('Free home sample collection across Bengaluru.', 'Caption/13 Regular', 'text/secondary', 'Message');
  pt.appendChild(pm); fillW(pm, 2);
  pt.appendChild(await tx('Book a test', 'Body/14 Medium', 'accent/teal-text', 'Link'));
  const art = figma.createRectangle(); art.name = 'Illustration'; art.resize(72, 72);
  art.fills = IMG.lab ? [IMG.lab] : [hpaint('accent/teal-soft')];
  pc.appendChild(art);
  const dots = auto('Page dots', 'HORIZONTAL'); gapV(dots, 4); dots.counterAxisAlignItems = 'CENTER';
  [16, 6, 6].forEach(function (w, i) {
    const d = figma.createRectangle(); d.name = 'Dot ' + (i + 1); d.resize(w, 6); bindRadius(d, 'pill');
    fillV(d, i === 0 ? 'brand/primary' : 'border/strong');
    dots.appendChild(d);
  });
  promo.appendChild(dots);

  addChrome(f, 'Home');
}

async function memberCard(parent, m) {
  const c = auto('Member / ' + m.name, 'VERTICAL');
  gapV(c, 12); padV(c, 16, 8, 16, 16); cardStyle(c);
  c.resize(170, 100); c.counterAxisSizingMode = 'FIXED'; c.primaryAxisSizingMode = 'AUTO';
  parent.appendChild(c);
  const top = auto('Top', 'HORIZONTAL'); top.primaryAxisAlignItems = 'SPACE_BETWEEN';
  put(c, top, true);
  top.appendChild(avatar('M', m.tone, m.initial));
  const more = variant('IconButton', 'Style=Plain'); more.name = 'More (Edit, Remove)';
  setProps(more, { Icon: HI.More.id });
  top.appendChild(more);
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(c, col, true);
  const n = await tx(m.name, 'Subheading/16 SemiBold', 'text/primary', 'Name');
  col.appendChild(n); fillW(n, 1);
  col.appendChild(await tx(m.relation + ' · ' + m.age, 'Caption/13 Regular', 'text/secondary', 'Relation and age'));
  const tags = auto('Tags', 'HORIZONTAL'); gapV(tags, 6);
  put(c, tags, true);
  tags.layoutWrap = 'WRAP'; tags.counterAxisSpacing = 6;
  tags.appendChild(await tag(m.blood, 'Droplet', 'brand/primary-soft', 'brand/primary', 'Blood group'));
  if (m.note) tags.appendChild(await tag(m.note[0], m.note[1], 'status/warning-soft', 'status/warning-text', 'Note'));
  return c;
}

async function buildFamily(f) {
  shell(f);
  const bar = HSET.TopBar.createInstance(); bar.name = 'TopBar';
  put(f, bar, true);
  setProps(bar, { Title: 'Family', 'Show action': true });
  setProps(exposed(bar, 'Action'), { Icon: HI.Plus.id });
  const c = content(f, 'Content', 8, 136, 16);
  const intro = await tx('Health profiles for everyone you care for. Tap a card to see their records and bookings.', 'Body/15 Regular', 'text/secondary', 'Intro');
  c.appendChild(intro); fillW(intro);
  const M = [
    { name: 'Aarav Mehta', relation: 'You', age: '34 yrs', blood: 'B+', tone: 'Navy', initial: 'A' },
    { name: 'Priya Mehta', relation: 'Spouse', age: '32 yrs', blood: 'O+', tone: 'Teal', initial: 'P' },
    { name: 'Kabir Mehta', relation: 'Son', age: '6 yrs', blood: 'B+', tone: 'Amber', initial: 'K', note: ['Vaccine due', 'Syringe'] },
    { name: 'Sunita Mehta', relation: 'Mother', age: '68 yrs', blood: 'A+', tone: 'Navy', initial: 'S', note: ['Diabetes', 'Heart Pulse'] },
  ];
  for (let i = 0; i < M.length; i += 2) {
    const r = auto('Row', 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN';
    put(c, r, true);
    const a = await memberCard(r, M[i]);
    const b = await memberCard(r, M[i + 1]);
    try { a.layoutSizingVertical = 'FILL'; b.layoutSizingVertical = 'FILL'; } catch (e) { /* equal heights are cosmetic */ }
  }
  const add = auto('Add family member', 'VERTICAL');
  mid(add); gapV(add, 8); fixed(add, 170, 148); bindRadius(add, 'card');
  strokeV(add, 'border/strong', 1.5); add.dashPattern = [6, 4];
  const pl = circ('Icon circle', 44, 'brand/primary-soft');
  pl.appendChild(ic('Plus', 'brand/primary', 22));
  add.appendChild(pl);
  add.appendChild(await tx('Add member', 'Body/14 Medium', 'brand/primary', 'Label'));
  c.appendChild(add);
  addChrome(f, 'Profile');
}

async function buildRecordsEmpty(f) {
  shell(f);
  const h = content(f, 'Header', 8, 0, 0);
  await tabHeader(h, 'Records', null);
  const body = emptyBody(f);
  body.appendChild(HSET.EmptyState.createInstance());
  addChrome(f, 'Records');
}

async function buildRecords(f) {
  shell(f);
  const c = content(f, 'Content', 8, 136, 20);
  await tabHeader(c, 'Records', 'Search');
  const filters = block(c, 'Filters', 4);
  const m = hScroll(filters, 'Member filter', 8);
  ['Everyone', 'Aarav', 'Priya', 'Kabir', 'Sunita'].forEach(function (l, i) { m.appendChild(chip(l, i === 0)); });
  const t = hScroll(filters, 'Type filter', 8);
  ['All types', 'Prescriptions', 'Lab reports', 'Scans', 'Vaccines', 'Discharge'].forEach(function (l, i) { t.appendChild(chip(l, i === 0)); });
  const GROUPS = [['November 2026', ['Prescription', 'Lab report']], ['October 2026', ['Scan']], ['September 2026', ['Discharge']], ['March 2022', ['Vaccine']]];
  for (const g of GROUPS) {
    const b = block(c, g[0], 12);
    await monthLabel(b, g[0]);
    for (const type of g[1]) put(b, variant('RecordCard', 'Type=' + type), true);
  }
  addChrome(f, 'Records');
  const fab = btn('Primary', 'L', 'Upload', 'Upload'); fab.name = 'Upload (floating)';
  fab.effects = [SHADOW_FLOAT];
  const nav = f.findChild(function (n) { return n.name === 'NavBar'; });
  f.insertChild(f.children.indexOf(nav), fab);
  fab.layoutPositioning = 'ABSOLUTE';
  fab.x = SW - 20 - fab.width; fab.y = SH - 72 - 20 - 16 - fab.height;
  fab.constraints = { horizontal: 'MAX', vertical: 'MAX' };
  try { fab.scrollBehavior = 'FIXED'; } catch (e) { /* older API */ }
}

async function buildBookingsEmpty(f) {
  shell(f);
  const h = content(f, 'Header', 8, 0, 16);
  await tabHeader(h, 'Bookings', null);
  put(h, variant('Segmented', 'Active=Left'), true);
  const body = emptyBody(f);
  const es = HSET.EmptyState.createInstance(); es.name = 'EmptyState / Bookings';
  body.appendChild(es);
  setProps(es, { Title: 'No upcoming bookings', Message: 'Book a doctor or a lab test and it shows up here, with a reminder before each visit.', Icon: HI.Calendar.id });
  setProps(exposed(es, 'Button / Upload a record'), { Label: 'Book a doctor', Icon: HI.Stethoscope.id });
  addChrome(f, 'Bookings');
}

async function labBookingCard(parent) {
  const c = auto('LabBookingCard', 'VERTICAL');
  gapV(c, 16); padV(c, 16, 16, 16, 16); cardStyle(c);
  put(parent, c, true);
  const top = auto('Top', 'HORIZONTAL'); gapV(top, 12);
  put(c, top, true);
  const tile = auto('Type tile', 'HORIZONTAL'); mid(tile); fixed(tile, 48, 48); bindRadius(tile, 'button'); fillV(tile, 'accent/teal-soft');
  tile.appendChild(ic('Flask', 'accent/teal-text', 24));
  top.appendChild(tile);
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(top, col, true);
  col.appendChild(await tx('Lab test', 'Micro/12 Medium', 'accent/teal-text', 'Type label'));
  col.appendChild(await tx('Full body checkup', 'Subheading/16 SemiBold', 'text/primary', 'Title'));
  const pr = await tx('Lal PathLabs, Indiranagar', 'Caption/13 Regular', 'text/secondary', 'Provider');
  col.appendChild(pr); fillW(pr, 1);
  col.appendChild(await tx('For Aarav and Priya', 'Micro/12 Medium', 'brand/primary', 'Member'));
  top.appendChild(pill('Upcoming'));
  const when = auto('When', 'HORIZONTAL'); gapV(when, 8); when.counterAxisAlignItems = 'CENTER';
  padV(when, 12, 12, 12, 12); bindRadius(when, 'button'); fillV(when, 'surface/background');
  put(c, when, true);
  when.appendChild(ic('Calendar', 'brand/primary', 20));
  when.appendChild(await tx('Sat, 21 Nov', 'Subheading/16 SemiBold', 'text/primary', 'Date'));
  when.appendChild(await tx('·', 'Subheading/16 SemiBold', 'text/secondary', 'Separator'));
  when.appendChild(ic('Clock', 'brand/primary', 20));
  when.appendChild(await tx('7:00 AM', 'Subheading/16 SemiBold', 'text/primary', 'Time'));
  const tags = auto('Tags', 'HORIZONTAL'); gapV(tags, 8);
  put(c, tags, true);
  tags.layoutWrap = 'WRAP'; tags.counterAxisSpacing = 8;
  tags.appendChild(await tag('Home collection', 'Home', 'accent/teal-soft', 'accent/teal-text', 'Home collection'));
  tags.appendChild(await tag('Fast 10–12 hours before', 'Info', 'status/warning-soft', 'status/warning-text', 'Preparation'));
  put(c, btn('Secondary', 'M', 'View details'), true);
}

async function buildBookings(f) {
  shell(f);
  const c = content(f, 'Content', 8, 136, 16);
  await tabHeader(c, 'Bookings', null);
  put(c, variant('Segmented', 'Active=Left'), true);
  await monthLabel(c, 'This week');
  put(c, variant('AppointmentCard', 'Status=Upcoming'), true);
  await labBookingCard(c);
  await monthLabel(c, 'Later');
  const later = variant('AppointmentCard', 'Status=Upcoming');
  put(c, later, true);
  setProps(later, { Doctor: 'Dr. Vikram Shetty', Specialty: 'Ophthalmologist', Clinic: 'Narayana Nethralaya, Rajajinagar', Member: 'For Sunita', Date: 'Wed, 2 Dec', Time: '11:00 AM' });
  setProps(exposed(later, 'Avatar'), { Initials: 'VS', Tone: 'Teal' });
  addChrome(f, 'Bookings');
}

async function listGroup(parent, title, rows) {
  const g = block(parent, title, 8);
  if (title) g.appendChild(await tx(title, 'Body/14 Medium', 'text/secondary', 'Group title'));
  const card = auto('Card', 'VERTICAL');
  bindRadius(card, 'card'); strokeV(card, 'border/subtle', 1); fillV(card, 'surface/card'); card.clipsContent = true;
  put(g, card, true);
  rows.forEach(function (r, i) {
    const lr = HSET.ListRow.createInstance(); lr.name = 'ListRow / ' + r[0];
    put(card, lr, true);
    setProps(lr, { Label: r[0], 'Show value': !!r[2], Divider: i < rows.length - 1, Icon: HI[r[1]].id });
    if (r[2]) setProps(lr, { Value: r[2] });
  });
  return card;
}

async function buildProfile(f) {
  shell(f);
  const c = content(f, 'Content', 8, 136, 24);
  await tabHeader(c, 'Profile', null);
  const head = auto('Account', 'HORIZONTAL'); head.counterAxisAlignItems = 'CENTER'; gapV(head, 16);
  padV(head, 16, 16, 16, 16); cardStyle(head);
  put(c, head, true);
  head.appendChild(avatar('L', 'Navy', 'A'));
  const col = auto('Text', 'VERTICAL'); gapV(col, 4);
  put(head, col, true);
  col.appendChild(await tx('Aarav Mehta', 'Heading/18 SemiBold', 'text/primary', 'Name'));
  col.appendChild(await tx('+91 98450 12345', 'Caption/13 Regular', 'text/secondary', 'Phone'));
  const edit = variant('IconButton', 'Style=Soft'); edit.name = 'Edit profile';
  setProps(edit, { Icon: HI.Edit.id });
  head.appendChild(edit);
  await listGroup(c, 'Family and health', [['Family members', 'People', '4 members'], ['Link ABHA', 'ID Card', 'Not linked'], ['Reminders', 'Alarm', '3 active']]);
  await listGroup(c, 'Account', [['Notifications', 'Bell', null], ['Payment methods', 'Card', 'UPI'], ['Privacy and data', 'Lock', null]]);
  await listGroup(c, 'Support', [['Help and support', 'Help', null], ['About HealthHub', 'Info', null], ['Replay app tips', 'Refresh', null]]);
  const out = block(c, 'Log out', 8);
  const card = auto('Card', 'VERTICAL');
  bindRadius(card, 'card'); strokeV(card, 'border/subtle', 1); fillV(card, 'surface/card'); card.clipsContent = true;
  put(out, card, true);
  put(card, HSET['ListRow Danger'].createInstance(), true);
  const ver = await tx('HealthHub · version 1.0', 'Caption/13 Regular', 'text/secondary', 'Version');
  ver.textAlignHorizontal = 'CENTER';
  c.appendChild(ver); fillW(ver);
  addChrome(f, 'Profile');
}

const A4_BUILDERS = {
  buildHome: buildHome, buildFamily: buildFamily, buildRecordsEmpty: buildRecordsEmpty, buildRecords: buildRecords,
  buildBookingsEmpty: buildBookingsEmpty, buildBookings: buildBookings, buildProfile: buildProfile,
};

// ---------- swap ----------
function findStatusBar(frame) {
  return frame.findOne(function (n) { return n.type === 'INSTANCE' && /status bar/i.test(n.name); });
}
function swapIn(orig, tmp) {
  const sb = findStatusBar(orig);
  if (sb) figma.currentPage.appendChild(sb); // park it while the frame is cleared
  orig.children.slice().forEach(function (n) { n.remove(); });
  shell(orig);
  const kids = tmp.children.slice().map(function (n) {
    return { n: n, abs: n.layoutPositioning === 'ABSOLUTE', x: n.x, y: n.y, c: n.constraints };
  });
  kids.forEach(function (k) {
    orig.appendChild(k.n);
    if (k.abs) {
      k.n.layoutPositioning = 'ABSOLUTE'; k.n.x = k.x; k.n.y = k.y; k.n.constraints = k.c;
      try { k.n.scrollBehavior = 'FIXED'; } catch (e) { /* older API */ }
    }
  });
  tmp.remove();
  if (!sb) { NOTES4.push(orig.name + ': no status bar instance found.'); return; }
  orig.insertChild(0, sb);
  sb.layoutSizingHorizontal = 'FILL';
  try { sb.scrollBehavior = 'FIXED'; } catch (e) { /* older API */ }
}
function restoreFrom(orig, archived) {
  orig.children.slice().forEach(function (n) { n.remove(); });
  orig.layoutMode = 'NONE';
  orig.fills = archived.fills;
  archived.children.forEach(function (n) { const c = n.clone(); orig.appendChild(c); c.x = n.x; c.y = n.y; });
}

async function runA4() {
  let page = null;
  const frames = {};
  for (const s of A4_SCREENS) {
    const n = await figma.getNodeByIdAsync(s[1]);
    if (!n || n.type !== 'FRAME') throw new Error('Screen "' + s[0] + '" (' + s[1] + ') not found.');
    frames[s[0]] = n;
    if (!page) { page = n; while (page && page.type !== 'PAGE') page = page.parent; }
  }
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();
  await loadA3(page);

  const ARCHIVE = 'HealthHub / _archive', SCREENS = 'HealthHub / Screens';
  let archive = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === ARCHIVE; })[0];
  const rerun = !!archive;
  const copies = {};
  if (rerun) {
    for (const s of A4_SCREENS) {
      copies[s[0]] = archive.findOne(function (n) { return n.getPluginData('origId') === s[1]; });
    }
  }
  await harvestFrom(rerun ? [copies.Home] : [frames.Home, await figma.getNodeByIdAsync('2703:2255')]);

  // 1. build every screen off-canvas first: if anything fails, nothing on the page has changed
  const built = {};
  let farX = -8000;
  try {
    for (const s of A4_SCREENS) {
      const tmp = figma.createFrame();
      tmp.name = 'tmp / ' + s[0]; page.appendChild(tmp);
      tmp.x = farX; tmp.y = -4000; farX += 500;
      built[s[0]] = tmp;
      await A4_BUILDERS[s[3]](tmp);
    }
  } catch (e) {
    Object.keys(built).forEach(function (k) { if (!built[k].removed) built[k].remove(); });
    throw e;
  }

  // 2. where the screens live now (the old "Group 4"), and where the archive goes
  const anyFrame = frames.Home;
  let base;
  const screensSec = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === SCREENS; })[0];
  if (screensSec) base = { x: screensSec.x, y: screensSec.y };
  else {
    const holder = anyFrame.parent.type === 'GROUP' ? anyFrame.parent : anyFrame;
    const b = holder.absoluteBoundingBox;
    base = { x: Math.round(b.x - 40), y: Math.round(b.y - 80) };
  }

  if (!rerun) {
    // lowest thing in the same horizontal band as the screens (ignores the tall components board to the right)
    const bandL = base.x, bandR = base.x + 40 + 9 * (SW + 60);
    let maxY = base.y + SH + 160;
    page.children.forEach(function (n) {
      const b = n.absoluteBoundingBox;
      if (n.name.indexOf('tmp / ') === 0 || !b) return;
      if (b.x < bandR && b.x + b.width > bandL) maxY = Math.max(maxY, b.y + b.height);
    });
    archive = figma.createSection();
    archive.name = ARCHIVE;
    page.appendChild(archive);
    archive.x = base.x; archive.y = Math.round(maxY + 400);
    let i = 0;
    for (const s of A4_SCREENS) {
      const cp = frames[s[0]].clone();
      archive.appendChild(cp);
      cp.name = '_archive / ' + frames[s[0]].name;
      cp.setPluginData('origId', s[1]);
      cp.x = 40 + i * (SW + 60); cp.y = 80; i++;
      copies[s[0]] = cp;
    }
    for (const a of A4_ARCHIVE_ONLY) {
      const n = await figma.getNodeByIdAsync(a[1]);
      if (!n) { NOTES4.push(a[0] + ' (' + a[1] + ') not found, so it was not archived.'); continue; }
      archive.appendChild(n);
      n.name = '_archive / ' + n.name;
      n.setPluginData('origId', a[1]);
      n.x = 40 + i * (SW + 60); n.y = 80; i++;
    }
    archive.resizeWithoutConstraints(40 + i * (SW + 60), SH + 160);
  }

  // 3. swap the new content into the original frames
  const done = [];
  const bgDiag = [];
  for (const s of A4_SCREENS) {
    const f = frames[s[0]];
    try {
      swapIn(f, built[s[0]]);
      f.name = s[2];
      bgDiag.push(await fixBg(f));
      done.push(s[0]);
    } catch (e) {
      restoreFrom(f, copies[s[0]]);
      if (!built[s[0]].removed) built[s[0]].remove();
      NOTES4.push(s[0] + ' FAILED and was restored: ' + (e && e.message ? e.message : e));
    }
  }

  // 4. move the screens out of "Group 4" into a section, in a row
  let sec = screensSec;
  if (!sec) {
    sec = figma.createSection();
    sec.name = SCREENS;
    page.appendChild(sec);
    sec.x = base.x; sec.y = base.y;
  }
  A4_SCREENS.forEach(function (s, i) {
    const f = frames[s[0]];
    if (f.parent !== sec) sec.appendChild(f);
    f.x = 40 + i * (SW + 80); f.y = 80;
  });
  sec.resizeWithoutConstraints(40 + A4_SCREENS.length * (SW + 80), SH + 160);

  const sel = A4_SCREENS.map(function (s) { return frames[s[0]]; });
  figma.currentPage.selection = sel;
  figma.viewport.scrollAndZoomIntoView(sel);

  // 5. screenshots: each screen as seen, plus the full scroll content
  const pngs = [];
  const contentH = {};
  for (const s of A4_SCREENS) {
    const f = frames[s[0]];
    pngs.push({ slug: 'a4-' + slug(s[0]), bytes: await f.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1.5 } }) });
    const ct = f.findChild(function (n) { return n.name === 'Content'; });
    if (ct) contentH[s[0]] = Math.round(ct.height);
    if (ct && ct.height > SH - 60) {
      // export a copy on the page: exporting inside the screen is cropped by the frame's clipping
      const cp = ct.clone();
      page.appendChild(cp);
      cp.x = -9000; cp.y = -6000;
      cp.fills = [hpaint('surface/background')];
      pngs.push({ slug: 'a4-' + slug(s[0]) + '-full', bytes: await cp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }) });
      cp.remove();
    }
  }
  NOTES4.forEach(function (n) { console.log('[A4] ' + n); });
  await upload('a4-screens', {
    generatedAt: new Date().toISOString(), rerun: rerun, done: done, notes: NOTES4, images: Object.keys(IMG), contentHeights: contentH, background: bgDiag,
    screens: A4_SCREENS.map(function (s) { const f = frames[s[0]]; return { key: s[0], id: f.id, name: f.name, parent: f.parent.name, h: f.height }; }),
    archive: { id: archive.id, children: archive.children.map(function (n) { return n.name; }) },
    section: { id: sec.id, x: sec.x, y: sec.y },
  }, pngs);
  const failed = NOTES4.filter(function (n) { return n.indexOf('FAILED') >= 0; }).length;
  return (failed ? '⚠ ' : '✓ ') + 'A4: rebuilt ' + done.length + '/7 screens in "' + SCREENS + '"' +
    (rerun ? ' (re-run)' : ', originals + 2 duplicates in "' + ARCHIVE + '"') + '.' + (NOTES4.length ? ' ' + NOTES4.length + ' note(s) in the console.' : '');
}

// =====================================================================
// A5a · New screens 1–14 (launch, auth, search, notifications, family, records)
// =====================================================================

const NOTES5 = [];
let STATUS_TEMPLATE = null;

function addStatusBar(f, light) {
  if (!STATUS_TEMPLATE) { NOTES5.push(f.name + ': no status bar template'); return; }
  const sb = STATUS_TEMPLATE.clone();
  f.insertChild(0, sb);
  sb.layoutSizingHorizontal = 'FILL';
  try { sb.scrollBehavior = 'FIXED'; } catch (e) { /* older API */ }
  if (light) {
    try { setProps(sb, { Theme: 'Light' }); } catch (e) { NOTES5.push(f.name + ': status bar has no Light theme (' + e.message + ')'); }
  }
}
function addIndicator(f, light) {
  const ind = figma.createRectangle();
  ind.name = 'Home indicator'; ind.resize(134, 5); bindRadius(ind, 'pill');
  fillV(ind, light ? 'text/inverse' : 'text/primary');
  absolute(f, ind, (SW - 134) / 2, SH - 8 - 5, { horizontal: 'CENTER', vertical: 'MAX' });
}
// sticky bottom bar with the main action(s); includes the 34px home-indicator safe area
function footer(f, buttons, extra) {
  const bar = auto('Footer', 'VERTICAL'); gapV(bar, 12); padV(bar, 12, 20, 34, 20);
  fillV(bar, 'surface/card');
  bar.strokes = [hpaint('border/subtle')]; bar.strokeAlign = 'INSIDE';
  bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0;
  bar.resize(SW, 10); bar.counterAxisSizingMode = 'FIXED'; bar.primaryAxisSizingMode = 'AUTO';
  if (extra) { bar.appendChild(extra); extra.layoutSizingHorizontal = 'FILL'; }
  const row = auto('Buttons', 'HORIZONTAL'); gapV(row, 12);
  bar.appendChild(row); row.layoutSizingHorizontal = 'FILL';
  for (const b of buttons) { row.appendChild(b); b.layoutSizingHorizontal = 'FILL'; }
  absolute(f, bar, 0, 0, { horizontal: 'STRETCH', vertical: 'MAX' });
  bar.y = SH - bar.height;
  return bar;
}
function newScreen(sec, name) {
  const f = figma.createFrame();
  sec.appendChild(f);
  f.name = 'HealthHub / ' + name;
  shell(f);
  return f;
}
function topBar(f, title, actionIcon) {
  const bar = HSET.TopBar.createInstance(); bar.name = 'TopBar';
  put(f, bar, true);
  setProps(bar, { Title: title || '', 'Show action': !!actionIcon });
  if (actionIcon) setProps(exposed(bar, 'Action'), { Icon: HI[actionIcon].id });
  return bar;
}
function cardBox(parent, name, padPx, spacing) {
  const c = auto(name, 'VERTICAL'); padV(c, padPx, padPx, padPx, padPx); gapV(c, spacing); cardStyle(c);
  put(parent, c, true);
  return c;
}
async function heading(parent, title, sub, center) {
  const b = block(parent, 'Heading', 8);
  if (center) b.counterAxisAlignItems = 'CENTER';
  const t = await tx(title, 'Title/22 SemiBold', 'text/primary', 'Title');
  b.appendChild(t); fillW(t); if (center) t.textAlignHorizontal = 'CENTER';
  if (sub) {
    const s = await tx(sub, 'Body/15 Regular', 'text/secondary', 'Subtitle');
    b.appendChild(s); fillW(s); if (center) s.textAlignHorizontal = 'CENTER';
  }
  return b;
}
function input(parent, label, value, state, helper) {
  const i = variant('Input', 'State=' + (state || 'Default'));
  i.name = 'Input / ' + label;
  put(parent, i, true);
  setProps(i, { Label: label, Value: value });
  if (helper === null) i.findOne(function (n) { return n.name === 'Helper row'; }).visible = false;
  else if (helper !== undefined) setText(i, 'Helper', helper);
  return i;
}
async function chipGroup(parent, label, items, active) {
  const g = block(parent, label, 8);
  g.appendChild(await tx(label, 'Body/14 Medium', 'text/primary', 'Label'));
  const r = auto('Chips', 'HORIZONTAL');
  put(g, r, true);
  r.layoutWrap = 'WRAP'; gapV(r, 8); r.counterAxisSpacing = 0;
  items.forEach(function (l, i) { r.appendChild(chip(l, Array.isArray(active) ? active.indexOf(i) >= 0 : i === active)); });
  return g;
}
async function kv(parent, k, v, last) {
  const r = auto(k, 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; gapV(r, 16); padV(r, 12, 0, 12, 0);
  put(parent, r, true);
  r.appendChild(await tx(k, 'Body/14 Medium', 'text/secondary', 'Key'));
  const t = await tx(v, 'Body/14 Medium', 'text/primary', 'Value');
  t.textAlignHorizontal = 'RIGHT';
  r.appendChild(t); fillW(t);
  if (!last) divider(parent);
  return r;
}
function checkbox(checked) {
  const b = auto('Checkbox', 'HORIZONTAL'); mid(b); fixed(b, 24, 24); b.cornerRadius = 6;
  if (checked) { fillV(b, 'brand/primary'); b.appendChild(ic('Tick', 'text/inverse', 16)); }
  else { fillV(b, 'surface/card'); strokeV(b, 'border/strong', 1.5); }
  return b;
}
function dotsRow(count, active) {
  const d = auto('Page dots', 'HORIZONTAL'); gapV(d, 4); d.counterAxisAlignItems = 'CENTER';
  for (let i = 0; i < count; i++) {
    const r = figma.createRectangle(); r.name = 'Dot ' + (i + 1); r.resize(i === active ? 20 : 6, 6); bindRadius(r, 'pill');
    fillV(r, i === active ? 'brand/primary' : 'border/strong');
    d.appendChild(r);
  }
  return d;
}
function progress(parent, pct) {
  const track = auto('Progress', 'HORIZONTAL'); track.resize(100, 6); track.counterAxisSizingMode = 'FIXED';
  bindRadius(track, 'pill'); fillV(track, 'border/subtle'); track.clipsContent = true;
  put(parent, track, true);
  const bar = figma.createRectangle(); bar.name = 'Value'; bar.resize(Math.round(pct * 2), 6); fillV(bar, 'brand/primary');
  track.appendChild(bar);
  bar.layoutSizingHorizontal = 'FIXED';
  return { track: track, bar: bar, pct: pct };
}
function logoMark(size, bg, fg) {
  const m = auto('Logo', 'HORIZONTAL'); mid(m); fixed(m, size, size); m.cornerRadius = Math.round(size * 0.3);
  fillV(m, bg);
  m.appendChild(ic('Heart Pulse', fg, Math.round(size * 0.58)));
  return m;
}
async function floatChip(parent, iconName, text, tone, x, y) {
  const c = auto('Chip / ' + text, 'HORIZONTAL'); c.counterAxisAlignItems = 'CENTER'; gapV(c, 8); padV(c, 10, 14, 10, 12);
  bindRadius(c, 'pill'); fillV(c, 'surface/card'); c.effects = [SHADOW_FLOAT];
  const cir = circ('Icon circle', 28, tone[0]); cir.appendChild(ic(iconName, tone[1], 16));
  c.appendChild(cir);
  c.appendChild(await tx(text, 'Body/14 Medium', 'text/primary', 'Label'));
  parent.appendChild(c); c.x = x; c.y = y;
  return c;
}

// ---- 1. Splash ----
async function a5Splash(sec) {
  const f = newScreen(sec, 'Splash');
  fillV(f, 'brand/primary');
  const body = auto('Body', 'VERTICAL');
  f.appendChild(body); body.layoutSizingHorizontal = 'FILL'; body.layoutSizingVertical = 'FILL';
  mid(body); gapV(body, 16); body.paddingBottom = 60;
  body.appendChild(logoMark(96, 'text/inverse', 'brand/primary'));
  body.appendChild(await tx('HealthHub', 'Display/28 Bold', 'text/inverse', 'Wordmark'));
  body.appendChild(await tx('Your family\'s health, organised', 'Body/15 Regular', 'brand/primary-soft', 'Tagline'));
  addStatusBar(f, true);
  addIndicator(f, true);
  return f;
}

// ---- 2–4. Onboarding ----
async function a5Onboarding(sec, n, o) {
  const f = newScreen(sec, 'Onboarding ' + n);
  const c = content(f, 'Content', 0, 140, 24);
  const top = auto('Top', 'HORIZONTAL'); top.primaryAxisAlignItems = 'MAX'; top.counterAxisAlignItems = 'CENTER';
  put(c, top, true); top.resize(353, 44); top.counterAxisSizingMode = 'FIXED';
  if (n < 3) top.appendChild(btn('Ghost', 'M', 'Skip'));
  const art = figma.createFrame(); art.name = 'Illustration'; art.resize(353, 330); art.fills = []; art.clipsContent = false;
  c.appendChild(art);
  const big = circ('Circle', 250, o.tone[0]);
  big.appendChild(ic(o.icon, o.tone[1], 112));
  art.appendChild(big); big.x = (353 - 250) / 2; big.y = 30;
  await floatChip(art, o.chips[0][0], o.chips[0][1], o.chips[0][2], 0, 64);
  await floatChip(art, o.chips[1][0], o.chips[1][1], o.chips[1][2], 150, 248);
  const copy = block(c, 'Copy', 12);
  copy.counterAxisAlignItems = 'CENTER';
  const t = await tx(o.title, 'Display/28 Bold', 'text/primary', 'Title');
  copy.appendChild(t); fillW(t); t.textAlignHorizontal = 'CENTER';
  const b = await tx(o.body, 'Body/15 Regular', 'text/secondary', 'Body');
  copy.appendChild(b); fillW(b); b.textAlignHorizontal = 'CENTER';
  copy.appendChild(dotsRow(3, n - 1));
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', n < 3 ? 'Next' : 'Get started', n < 3 ? null : 'Arrow Right')]);
  addIndicator(f);
  return f;
}

// ---- 5. Sign in ----
async function a5SignIn(sec) {
  const f = newScreen(sec, 'Sign in');
  const c = content(f, 'Content', 24, 160, 24);
  c.appendChild(logoMark(56, 'brand/primary', 'text/inverse'));
  await heading(c, 'Sign in with your phone', 'We\'ll text you a 6-digit code. No password needed.');
  input(c, 'Mobile number', '+91 98450 12345', 'Focused', 'Used only to sign in and send booking updates.');
  const note = auto('Privacy note', 'HORIZONTAL'); gapV(note, 12); padV(note, 12, 12, 12, 12);
  bindRadius(note, 'button'); fillV(note, 'brand/primary-soft');
  put(c, note, true);
  note.appendChild(ic('Lock', 'brand/primary', 20));
  const nt = await tx('Your records are encrypted and only your account can see them.', 'Caption/13 Regular', 'brand/primary', 'Text');
  note.appendChild(nt); fillW(nt);
  addStatusBar(f);
  const terms = await tx('By continuing you agree to the Terms of use and Privacy policy.', 'Caption/13 Regular', 'text/secondary', 'Terms');
  terms.textAlignHorizontal = 'CENTER';
  footer(f, [btn('Primary', 'L', 'Send code')], terms);
  addIndicator(f);
  return f;
}

// ---- 6. OTP ----
async function a5Otp(sec) {
  const f = newScreen(sec, 'Verify OTP');
  topBar(f, 'Verify number', null);
  const c = content(f, 'Content', 8, 160, 24);
  await heading(c, 'Enter the 6-digit code', 'Sent to +91 98450 12345');
  c.appendChild(HSET.OTPInput.createInstance());
  const row = auto('Resend', 'HORIZONTAL'); gapV(row, 6); row.counterAxisAlignItems = 'CENTER';
  c.appendChild(row);
  row.appendChild(ic('Clock', 'text/secondary', 16));
  row.appendChild(await tx('Resend code in 0:24', 'Body/14 Medium', 'text/secondary', 'Timer'));
  const change = await tx('Wrong number? Change it', 'Body/14 Medium', 'brand/primary', 'Change number');
  c.appendChild(change);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Verify')]);
  addIndicator(f);
  return f;
}

// ---- 7. Create profile ----
async function a5CreateProfile(sec) {
  const f = newScreen(sec, 'Create profile');
  topBar(f, 'Step 1 of 2', null);
  const c = content(f, 'Content', 8, 140, 20);
  await heading(c, 'Tell us about you', 'This is your own health profile. You can add family next.');
  const ph = auto('Photo', 'HORIZONTAL'); gapV(ph, 16); ph.counterAxisAlignItems = 'CENTER';
  put(c, ph, true);
  ph.appendChild(avatar('L', 'Navy', 'A'));
  ph.appendChild(btn('Secondary', 'M', 'Add photo', 'Camera'));
  input(c, 'Full name', 'Aarav Mehta', 'Default', null);
  input(c, 'Date of birth', '12 Aug 1992', 'Default', null);
  await chipGroup(c, 'Gender', ['Male', 'Female', 'Other', 'Prefer not to say'], 0);
  input(c, 'Email (optional)', 'aarav.mehta@example.com', 'Default', 'For receipts and report copies.');
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Continue')]);
  addIndicator(f);
  return f;
}

// ---- 8. Add first family member ----
async function a5AddFirstMember(sec) {
  const f = newScreen(sec, 'Add first family member');
  topBar(f, 'Step 2 of 2', null);
  const c = content(f, 'Content', 8, 190, 20);
  await heading(c, 'Add someone you care for', 'Keep records, vaccines and bookings for each person in one place.');
  await chipGroup(c, 'Relation', ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'], 1);
  input(c, 'Name', 'Kabir Mehta', 'Default', null);
  input(c, 'Date of birth', '3 Feb 2020', 'Default', 'Kabir is 6 years old.');
  await chipGroup(c, 'Blood group', ['A+', 'B+', 'O+', 'AB+', 'Not sure'], 1);
  const consent = auto('Guardian consent', 'HORIZONTAL'); gapV(consent, 12); padV(consent, 14, 14, 14, 14);
  bindRadius(consent, 'button'); fillV(consent, 'brand/primary-soft');
  put(c, consent, true);
  consent.appendChild(checkbox(true));
  const ct = await tx('I\'m Kabir\'s parent or legal guardian, and I agree to store his health information in HealthHub.', 'Body/14 Medium', 'text/primary', 'Text');
  consent.appendChild(ct); fillW(ct);
  addStatusBar(f);
  footer(f, [btn('Ghost', 'L', 'Skip for now'), btn('Primary', 'L', 'Add member')]);
  addIndicator(f);
  return f;
}

// ---- 9. Search results ----
async function a5Search(sec) {
  const f = newScreen(sec, 'Search results');
  const c = content(f, 'Content', 8, 140, 20);
  const top = auto('Search row', 'HORIZONTAL'); gapV(top, 4); top.counterAxisAlignItems = 'CENTER';
  put(c, top, true);
  const back = variant('IconButton', 'Style=Plain'); back.name = 'Back';
  top.appendChild(back);
  const sb = HSET.SearchBar.createInstance(); sb.name = 'SearchBar (typed)';
  top.appendChild(sb); sb.layoutSizingHorizontal = 'FILL';
  setProps(sb, { Placeholder: 'thyroid' });
  sb.findOne(function (n) { return n.type === 'TEXT' && n.name === 'Placeholder'; }).fills = [hpaint('text/primary')];
  const tabs = hScroll(c, 'Result tabs', 8);
  ['All', 'Doctors', 'Lab tests', 'Records'].forEach(function (l, i) { tabs.appendChild(chip(l, i === 0)); });
  const labs = block(c, 'Lab tests', 12);
  sectionHead(labs, 'Lab tests', 'See all 4');
  const lab = HSET.LabPackageCard.createInstance(); lab.name = 'LabPackageCard / Thyroid profile';
  put(labs, lab, true);
  setProps(lab, { Name: 'Thyroid profile', Tests: '3 tests included (T3, T4, TSH)', 'Report time': 'Report in 12 h', 'Price value': '₹499', MRP: '₹999', Discount: '50% off' });
  const docs = block(c, 'Doctors', 12);
  sectionHead(docs, 'Doctors', 'See all 6');
  const doc = HSET.DoctorCard.createInstance(); doc.name = 'DoctorCard / Dr. Meera Iyer';
  put(docs, doc, true);
  setProps(doc, { Name: 'Dr. Meera Iyer', Specialty: 'Endocrinologist', Experience: '15 yrs exp · English, Tamil, Kannada', 'Rating value': '4.9', Reviews: '(486 reviews)', 'Fee value': '₹800', 'Next slot': 'Tomorrow, 10:30 AM' });
  setProps(exposed(doc, 'Avatar'), { Initials: 'MI', Tone: 'Navy' });
  const recs = block(c, 'Your records', 12);
  sectionHead(recs, 'Your records', null);
  const r = variant('RecordCard', 'Type=Lab report');
  put(recs, r, true);
  setText(r, 'Title', 'Thyroid profile (T3, T4, TSH)');
  setText(r, 'Member and date', 'Sunita · 4 Oct 2026');
  setText(r, 'File count', '1');
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 10. Notifications ----
async function notifRow(parent, n, last) {
  const r = auto(n.title, 'HORIZONTAL'); gapV(r, 12); padV(r, 16, 16, 16, 16);
  put(parent, r, true);
  if (n.unread) fillV(r, 'brand/primary-soft');
  const cir = circ('Icon circle', 40, n.tone[0]);
  cir.appendChild(ic(n.icon, n.tone[1], 20));
  r.appendChild(cir);
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  const tt = await tx(n.title, 'Subheading/16 SemiBold', 'text/primary', 'Title');
  col.appendChild(tt); fillW(tt);
  const m = await tx(n.msg, 'Caption/13 Regular', 'text/secondary', 'Message');
  col.appendChild(m); fillW(m, 2);
  col.appendChild(await tx(n.time, 'Micro/12 Medium', 'text/secondary', 'Time'));
  if (n.unread) {
    const d = figma.createEllipse(); d.name = 'Unread dot'; d.resize(8, 8); fillV(d, 'brand/primary');
    r.appendChild(d);
  }
  if (!last) divider(parent);
}
async function a5Notifications(sec) {
  const f = newScreen(sec, 'Notifications');
  topBar(f, 'Notifications', null);
  const c = content(f, 'Content', 8, 140, 16);
  const NAVY = ['brand/primary-soft', 'brand/primary'], TEAL = ['accent/teal-soft', 'accent/teal-text'], AMBER = ['status/warning-soft', 'status/warning-text'];
  const GROUPS = [
    ['Today', [
      { title: 'Report ready', msg: 'Kabir\'s complete blood count from Lal PathLabs is ready to view.', time: '2 h ago', icon: 'Document', tone: TEAL, unread: true },
      { title: 'Vaccine due in 3 days', msg: 'Kabir\'s MMR vaccine (dose 2) is due on Fri, 20 Nov.', time: '5 h ago', icon: 'Syringe', tone: AMBER, unread: true },
      { title: 'Appointment confirmed', msg: 'Dr. Ananya Rao, Thu 19 Nov at 4:30 PM. Booking HH-4K2P9Q.', time: '9:12 AM', icon: 'Calendar Tick', tone: NAVY },
    ]],
    ['Earlier', [
      { title: 'Dose taken', msg: 'Sunita took Metformin 500 mg at 8:34 AM.', time: 'Yesterday', icon: 'Pill', tone: TEAL },
      { title: 'Lab test booked', msg: 'Full body checkup for Aarav and Priya, Sat 21 Nov, 7:00 AM.', time: 'Mon', icon: 'Flask', tone: NAVY },
    ]],
  ];
  for (const g of GROUPS) {
    const b = block(c, g[0], 8);
    await monthLabel(b, g[0]);
    const card = auto('Card', 'VERTICAL'); bindRadius(card, 'card'); strokeV(card, 'border/subtle', 1); fillV(card, 'surface/card'); card.clipsContent = true;
    put(b, card, true);
    for (let i = 0; i < g[1].length; i++) await notifRow(card, g[1][i], i === g[1].length - 1);
  }
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 11. Member details ----
async function stat(parent, label, value) {
  const s = auto(label, 'VERTICAL'); gapV(s, 2); padV(s, 12, 12, 12, 12); cardStyle(s); bindRadius(s, 'button');
  put(parent, s, true);
  s.appendChild(await tx(label, 'Micro/12 Medium', 'text/secondary', 'Label'));
  s.appendChild(await tx(value, 'Subheading/16 SemiBold', 'text/primary', 'Value'));
}
async function a5MemberDetails(sec) {
  const f = newScreen(sec, 'Member details');
  topBar(f, 'Kabir Mehta', 'Edit');
  const c = content(f, 'Content', 8, 140, 24);
  const head = auto('Header', 'HORIZONTAL'); gapV(head, 16); head.counterAxisAlignItems = 'CENTER';
  put(c, head, true);
  head.appendChild(avatar('L', 'Amber', 'K'));
  const hc = auto('Text', 'VERTICAL'); gapV(hc, 4);
  put(head, hc, true);
  hc.appendChild(await tx('Kabir Mehta', 'Title/22 SemiBold', 'text/primary', 'Name'));
  hc.appendChild(await tx('Son · 6 yrs · Born 3 Feb 2020', 'Caption/13 Regular', 'text/secondary', 'Meta'));
  const stats = auto('Vitals', 'HORIZONTAL'); gapV(stats, 8);
  put(c, stats, true);
  await stat(stats, 'Blood group', 'B+');
  await stat(stats, 'Height', '116 cm');
  await stat(stats, 'Weight', '21 kg');
  const health = cardBox(c, 'Health info', 16, 12);
  for (const sct of [['Allergies', [['Peanuts', 'Warning', 'status/danger-soft', 'status/danger-text'], ['Dust mites', 'Warning', 'status/danger-soft', 'status/danger-text']]], ['Conditions', null], ['Current medicines', null]]) {
    const row = block(health, sct[0], 8);
    row.appendChild(await tx(sct[0], 'Body/14 Medium', 'text/secondary', 'Label'));
    if (sct[1]) {
      const tags = auto('Tags', 'HORIZONTAL'); gapV(tags, 8);
      put(row, tags, true);
      for (const t of sct[1]) tags.appendChild(await tag(t[0], t[1], t[2], t[3], t[0]));
    } else row.appendChild(await tx('None recorded', 'Body/15 Regular', 'text/primary', 'Value'));
  }
  const up = block(c, 'Coming up', 12);
  sectionHead(up, 'Coming up', null);
  put(up, variant('ComingUpCard', 'Kind=Vaccine'), true);
  const links = block(c, 'Shortcuts', 8);
  links.appendChild(await tx('Kabir\'s health', 'Body/14 Medium', 'text/secondary', 'Group title'));
  const card = auto('Card', 'VERTICAL'); bindRadius(card, 'card'); strokeV(card, 'border/subtle', 1); fillV(card, 'surface/card'); card.clipsContent = true;
  put(links, card, true);
  [['Records', 'Document', '6 records'], ['Bookings', 'Calendar Tick', '1 upcoming'], ['Reminders', 'Alarm', '1 active']].forEach(function (r, i, a) {
    const lr = HSET.ListRow.createInstance(); lr.name = 'ListRow / ' + r[0];
    put(card, lr, true);
    setProps(lr, { Label: r[0], Value: r[2], 'Show value': true, Divider: i < a.length - 1, Icon: HI[r[1]].id });
  });
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 12. Add / edit member ----
async function a5EditMember(sec) {
  const f = newScreen(sec, 'Edit member');
  topBar(f, 'Edit member', null);
  const c = content(f, 'Content', 8, 140, 20);
  const ph = auto('Photo', 'HORIZONTAL'); gapV(ph, 16); ph.counterAxisAlignItems = 'CENTER';
  put(c, ph, true);
  ph.appendChild(avatar('L', 'Amber', 'K'));
  ph.appendChild(btn('Secondary', 'M', 'Change photo', 'Camera'));
  input(c, 'Name', 'Kabir Mehta', 'Default', null);
  await chipGroup(c, 'Relation', ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'], 1);
  input(c, 'Date of birth', '3 Feb 2020', 'Default', null);
  await chipGroup(c, 'Blood group', ['A+', 'B+', 'O+', 'AB+', 'Not sure'], 1);
  const hw = auto('Height and weight', 'HORIZONTAL'); gapV(hw, 12);
  put(c, hw, true);
  const h = input(hw, 'Height (cm)', '116', 'Default', null); h.layoutSizingHorizontal = 'FILL';
  const w = input(hw, 'Weight (kg)', '210', 'Error', 'Looks too high for age 6'); w.layoutSizingHorizontal = 'FILL';
  const al = await chipGroup(c, 'Allergies', ['Peanuts', 'Dust mites'], [0, 1]);
  const addAl = chip('+ Add allergy', false);
  al.findOne(function (n) { return n.name === 'Chips'; }).appendChild(addAl);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Save changes')]);
  addIndicator(f);
  return f;
}

// ---- 13. Upload record ----
async function sourceTile(parent, iconName, label, selected) {
  const t = auto(label, 'VERTICAL'); mid(t); gapV(t, 8); padV(t, 16, 8, 16, 8); bindRadius(t, 'card');
  put(parent, t, true);
  if (selected) { fillV(t, 'brand/primary-soft'); strokeV(t, 'brand/primary', 2); }
  else { fillV(t, 'surface/card'); strokeV(t, 'border/subtle', 1); }
  const cir = circ('Icon circle', 44, selected ? 'surface/card' : 'brand/primary-soft');
  cir.appendChild(ic(iconName, 'brand/primary', 22));
  t.appendChild(cir);
  t.appendChild(await tx(label, 'Body/14 Medium', selected ? 'brand/primary' : 'text/primary', 'Label'));
}
async function a5Upload(sec) {
  const f = newScreen(sec, 'Upload record');
  topBar(f, 'Upload record', null);
  const c = content(f, 'Content', 8, 140, 20);
  const src = auto('Source', 'HORIZONTAL'); gapV(src, 12);
  put(c, src, true);
  await sourceTile(src, 'Camera', 'Camera', true);
  await sourceTile(src, 'Gallery', 'Gallery', false);
  await sourceTile(src, 'Document', 'PDF file', false);
  const file = auto('File', 'HORIZONTAL'); gapV(file, 12); padV(file, 12, 8, 12, 12); file.counterAxisAlignItems = 'CENTER';
  cardStyle(file); put(c, file, true);
  const th = auto('Thumbnail', 'HORIZONTAL'); mid(th); fixed(th, 56, 56); bindRadius(th, 'sm'); fillV(th, 'brand/primary-soft');
  th.appendChild(ic('Prescription', 'brand/primary', 26));
  file.appendChild(th);
  const fc = auto('Text', 'VERTICAL'); gapV(fc, 4);
  put(file, fc, true);
  fc.appendChild(await tx('IMG_2041.jpg', 'Body/14 Medium', 'text/primary', 'File name'));
  fc.appendChild(await tx('Compressed to 1.2 MB · uploading 64%', 'Caption/13 Regular', 'text/secondary', 'Status'));
  const pg = progress(fc, 64);
  pg.bar.resize(Math.round(pg.track.width * 0.64), 6);
  const rm = variant('IconButton', 'Style=Plain'); rm.name = 'Remove file';
  setProps(rm, { Icon: HI.Close.id });
  file.appendChild(rm);
  await chipGroup(c, 'Type', ['Prescription', 'Lab report', 'Scan', 'Vaccine', 'Discharge'], 0);
  await chipGroup(c, 'For', ['Aarav', 'Priya', 'Kabir', 'Sunita'], 2);
  input(c, 'Date', '12 Nov 2026', 'Default', null);
  input(c, 'Doctor or lab', 'Dr. Ananya Rao', 'Default', null);
  input(c, 'Notes (optional)', 'Fever for 3 days, cough at night', 'Default', null);
  const note = auto('Privacy note', 'HORIZONTAL'); gapV(note, 8); note.counterAxisAlignItems = 'CENTER';
  put(c, note, true);
  note.appendChild(ic('Lock', 'text/secondary', 16));
  const nt = await tx('Stored privately. Only your account can see it.', 'Caption/13 Regular', 'text/secondary', 'Text');
  note.appendChild(nt); fillW(nt);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Save record')]);
  addIndicator(f);
  return f;
}

// ---- 14. Record details ----
async function a5RecordDetails(sec) {
  const f = newScreen(sec, 'Record details');
  topBar(f, 'Record details', 'More');
  const c = content(f, 'Content', 8, 160, 20);
  const pv = figma.createFrame(); pv.name = 'Preview (tap to zoom)'; pv.resize(353, 230); pv.clipsContent = true;
  bindRadius(pv, 'card'); fillV(pv, 'brand/primary-soft');
  put(c, pv, true);
  const paper = figma.createFrame(); paper.name = 'Prescription page'; paper.resize(160, 200); paper.cornerRadius = 6;
  fillV(paper, 'surface/card'); paper.effects = [SHADOW_FLOAT];
  pv.appendChild(paper); paper.x = (353 - 160) / 2; paper.y = 18; paper.rotation = -3;
  const head = figma.createRectangle(); head.name = 'Letterhead'; head.resize(128, 16); head.cornerRadius = 4; fillV(head, 'brand/primary');
  paper.appendChild(head); head.x = 16; head.y = 16;
  [56, 52, 80, 70, 96, 60, 84].forEach(function (w, i) {
    const l = figma.createRectangle(); l.name = 'Line'; l.resize(w + 32, 4); l.cornerRadius = 2; fillV(l, 'border/subtle');
    paper.appendChild(l); l.x = 16; l.y = 48 + i * 16;
  });
  const zoom = auto('Zoom hint', 'HORIZONTAL'); zoom.counterAxisAlignItems = 'CENTER'; gapV(zoom, 4); padV(zoom, 4, 10, 4, 8);
  bindRadius(zoom, 'pill'); fillV(zoom, 'surface/card');
  zoom.appendChild(ic('Search', 'text/primary', 14));
  zoom.appendChild(await tx('Tap to zoom', 'Micro/12 Medium', 'text/primary', 'Label'));
  pv.appendChild(zoom); zoom.x = 353 - 12 - 110; zoom.y = 230 - 12 - 24;
  const tb = block(c, 'Title', 8);
  tb.appendChild(await tag('Prescription', 'Prescription', 'brand/primary-soft', 'brand/primary', 'Type'));
  tb.appendChild(await tx('Fever and cough', 'Title/22 SemiBold', 'text/primary', 'Title'));
  const det = cardBox(c, 'Details', 16, 0);
  det.paddingTop = 4; det.paddingBottom = 4;
  await kv(det, 'For', 'Kabir Mehta');
  await kv(det, 'Date', '12 Nov 2026');
  await kv(det, 'Doctor', 'Dr. Ananya Rao');
  await kv(det, 'Clinic', 'Rainbow Children\'s Clinic, Indiranagar');
  await kv(det, 'Files', '1 photo · 1.2 MB', true);
  const notes = cardBox(c, 'Notes', 16, 8);
  notes.appendChild(await tx('Notes', 'Body/14 Medium', 'text/secondary', 'Label'));
  const nt = await tx('Paracetamol 250 mg if fever is above 100°F. Steam twice a day. Review in 3 days if the cough continues.', 'Body/15 Regular', 'text/primary', 'Text');
  notes.appendChild(nt); fillW(nt);
  addStatusBar(f);
  footer(f, [btn('Secondary', 'L', 'Share', 'Share'), btn('Primary', 'L', 'PDF', 'Download')]);
  addIndicator(f);
  return f;
}

async function exportScreens(page, frames, prefix) {
  const pngs = [], heights = {};
  for (const f of frames) {
    const s = slug(f.name.replace('HealthHub / ', ''));
    pngs.push({ slug: prefix + s, bytes: await f.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1.5 } }) });
    const ct = f.findChild(function (n) { return n.name === 'Content'; });
    if (ct) heights[f.name] = Math.round(ct.height);
    if (ct && ct.y + ct.height > SH) {
      const cp = ct.clone(); page.appendChild(cp); cp.x = -9000; cp.y = -6000; cp.fills = [hpaint('surface/background')];
      pngs.push({ slug: prefix + s + '-full', bytes: await cp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }) });
      cp.remove();
    }
  }
  return { pngs: pngs, heights: heights };
}

async function runA5a() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found. Run A4 first.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();
  await loadA3(page);
  for (const n of ['OTPInput', 'DoctorCard', 'LabPackageCard', 'Input']) if (!HSET[n]) throw new Error('Component ' + n + ' missing (re-run A3).');
  STATUS_TEMPLATE = findStatusBar(home);

  const NAME = 'HealthHub / A5a screens';
  const old = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === NAME; })[0];
  let pos;
  if (old) { pos = { x: old.x, y: old.y }; old.remove(); }
  else {
    const below = page.children.filter(function (n) { return n.type === 'SECTION' && (n.name === 'HealthHub / Screens' || n.name === 'HealthHub / _archive'); });
    if (!below.length) throw new Error('No "HealthHub / Screens" section. Run A4 first.');
    let bottom = -Infinity, x = Infinity;
    below.forEach(function (s) { bottom = Math.max(bottom, s.y + s.height); x = Math.min(x, s.x); });
    pos = { x: x, y: Math.round(bottom + 400) };
  }
  const sec = figma.createSection();
  sec.name = NAME;
  page.appendChild(sec);
  sec.x = pos.x; sec.y = pos.y;

  const frames = [];
  try {
    frames.push(await a5Splash(sec));
    frames.push(await a5Onboarding(sec, 1, {
      title: 'All your family\'s records in one place', body: 'Prescriptions, lab reports, scans and vaccine certificates for everyone, sorted by person and date.',
      icon: 'Folder', tone: ['brand/primary-soft', 'brand/primary'],
      chips: [['Prescription', 'Prescription', ['brand/primary-soft', 'brand/primary']], ['Flask', 'Lab report', ['accent/teal-soft', 'accent/teal-text']]],
    }));
    frames.push(await a5Onboarding(sec, 2, {
      title: 'Never miss a dose or a vaccine', body: 'Gentle reminders for medicines, vaccines and check-ups, for every family member.',
      icon: 'Alarm', tone: ['status/warning-soft', 'status/warning-text'],
      chips: [['Syringe', 'MMR due in 3 days', ['status/warning-soft', 'status/warning-text']], ['Pill', 'Metformin · 8:30 AM', ['accent/teal-soft', 'accent/teal-text']]],
    }));
    frames.push(await a5Onboarding(sec, 3, {
      title: 'Book doctors and lab tests', body: 'Verified doctors and NABL-accredited labs across Bengaluru, with home sample collection.',
      icon: 'Stethoscope', tone: ['accent/teal-soft', 'accent/teal-text'],
      chips: [['Shield Tick', 'Verified doctors', ['accent/teal-soft', 'accent/teal-text']], ['Home', 'Home collection', ['brand/primary-soft', 'brand/primary']]],
    }));
    frames.push(await a5SignIn(sec));
    frames.push(await a5Otp(sec));
    frames.push(await a5CreateProfile(sec));
    frames.push(await a5AddFirstMember(sec));
    frames.push(await a5Search(sec));
    frames.push(await a5Notifications(sec));
    frames.push(await a5MemberDetails(sec));
    frames.push(await a5EditMember(sec));
    frames.push(await a5Upload(sec));
    frames.push(await a5RecordDetails(sec));
  } catch (e) {
    sec.remove();
    throw e;
  }

  const bg = [];
  for (const f of frames) bg.push(await fixBg(f));
  frames.forEach(function (f, i) { f.x = 40 + (i % 7) * (SW + 80); f.y = 80 + Math.floor(i / 7) * (SH + 120); });
  sec.resizeWithoutConstraints(40 + 7 * (SW + 80), 80 + 2 * (SH + 120) + 40);
  figma.currentPage.selection = [sec];
  figma.viewport.scrollAndZoomIntoView([sec]);

  const ex = await exportScreens(page, frames, 'a5a-');
  NOTES5.forEach(function (n) { console.log('[A5a] ' + n); });
  await upload('a5a-screens', {
    generatedAt: new Date().toISOString(), notes: NOTES5, background: bg, contentHeights: ex.heights,
    section: { id: sec.id, x: sec.x, y: sec.y }, frames: frames.map(function (f) { return { id: f.id, name: f.name }; }),
  }, ex.pngs);
  return '✓ A5a: ' + frames.length + ' new screens in "' + NAME + '".' + (NOTES5.length ? ' ' + NOTES5.length + ' note(s) in the console.' : '');
}

// =====================================================================
// Screen backgrounds
// Pixel probes (2026-11-17) showed that a variable-BOUND fill renders black on the screen frames, even though
// resolveForConsumer reports the right colour. Scroll overflow, pinned children and old styles were ruled out.
// So screens get a plain fill with the token's exact value, and the result is checked by reading real pixels.
// =====================================================================

const BG_POINTS = [[0.02, 0.4], [0.02, 0.6]]; // left margin: always plain screen background

async function fixBg(f) {
  const varName = f.name === 'HealthHub / Splash' ? 'brand/primary' : 'surface/background';
  const want = rgb(HH_COLORS.filter(function (c) { return c[0] === varName; })[0][1]);
  f.fills = [{ type: 'SOLID', color: want }];
  // keep prototype scrolling: frame scrolls vertically; status bar, nav, footer, fade, indicator stay pinned
  f.overflowDirection = 'VERTICAL';
  f.children.forEach(function (c) {
    const pinned = c.layoutPositioning === 'ABSOLUTE' || /status bar/i.test(c.name);
    try { c.scrollBehavior = pinned ? 'FIXED' : 'SCROLLS'; } catch (e) { /* older API */ }
  });
  const c = await probe(f, BG_POINTS);
  return { name: f.name, fill: varName + ' as plain ' + toHex(want), pixels: c.map(rgbaHex).join(' / '), ok: !isDark(c) };
}

async function runFixBg() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();

  const secs = page.children.filter(function (n) { return n.type === 'SECTION' && (n.name === 'HealthHub / Screens' || n.name === 'HealthHub / A5a screens'); });
  const frames = [];
  secs.forEach(function (s) { s.children.forEach(function (n) { if (n.type === 'FRAME') frames.push(n); }); });
  if (!frames.length) throw new Error('No screens found in "HealthHub / Screens" or "HealthHub / A5a screens".');
  const diag = [];
  for (const f of frames) diag.push(await fixBg(f));

  const pngs = [];
  for (const f of frames) {
    pngs.push({ slug: 'bg-' + slug(f.name.replace('HealthHub / ', '')), bytes: await f.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1.5 } }) });
  }
  await upload('fix-backgrounds', { generatedAt: new Date().toISOString(), screens: diag }, pngs);
  const bad = diag.filter(function (d) { return !d.ok; });
  return (bad.length ? '⚠ ' : '✓ ') + 'Backgrounds: ' + (frames.length - bad.length) + '/' + frames.length + ' screens correct, scrolling and pinned bars kept.' +
    (bad.length ? ' Still dark: ' + bad.map(function (d) { return d.name; }).join(', ') : '');
}


// =====================================================================
// A5b · New screens 15–26 (doctor booking, lab booking)
// =====================================================================

// add any HH_ICONS that the A3 icon grid doesn't have yet (A3 can't be re-run once screens use its components)
async function ensureIcons(page) {
  const sec = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / Components'; })[0];
  const grid = sec.findOne(function (n) { return n.name === 'Icon grid'; });
  const added = [];
  for (const name of Object.keys(HH_ICONS)) {
    if (HI[name]) continue;
    const cell = auto('Cell / ' + name, 'VERTICAL');
    cell.counterAxisAlignItems = 'CENTER'; cell.itemSpacing = 6;
    cell.resize(84, 60); cell.counterAxisSizingMode = 'FIXED';
    grid.appendChild(cell);
    makeIcon(cell, name, HH_ICONS[name], null);
    const l = await tx(name, 'Micro/12 Medium', 'text/secondary', 'Name');
    l.textAlignHorizontal = 'CENTER';
    cell.appendChild(l); fillW(l, 1);
    added.push(name);
  }
  if (added.length) {
    const board = sec.children[0];
    sec.resizeWithoutConstraints(board.width, board.height);
  }
  return added;
}

// Fixes to A3 components that screens already use (A3 can't be re-run). Instances update automatically.
function patchComponents() {
  const done = [];
  // binding the MRP text property reset its strikethrough; re-apply on the main component
  const mrp = HSET.LabPackageCard.findOne(function (n) { return n.type === 'TEXT' && n.name === 'MRP'; });
  if (mrp && mrp.textDecoration !== 'STRIKETHROUGH') { mrp.textDecoration = 'STRIKETHROUGH'; done.push('LabPackageCard: MRP struck through'); }
  // long names pushed the Verified pill past the card edge: name fills the row and truncates
  const row = HSET.DoctorCard.findOne(function (n) { return n.name === 'Name row'; });
  const nm = row && row.findOne(function (n) { return n.type === 'TEXT' && n.name === 'Name'; });
  if (nm && nm.layoutSizingHorizontal !== 'FILL') {
    row.layoutSizingHorizontal = 'FILL';
    nm.textAutoResize = 'HEIGHT'; nm.layoutSizingHorizontal = 'FILL';
    nm.textTruncation = 'ENDING'; nm.maxLines = 1;
    done.push('DoctorCard: name fills the row and truncates before the Verified pill');
  }
  return done;
}

function radio(on) {
  const r = circ('Radio', 22, null);
  strokeV(r, on ? 'brand/primary' : 'border/strong', on ? 2 : 1.5);
  if (on) { const d = figma.createEllipse(); d.name = 'Dot'; d.resize(10, 10); fillV(d, 'brand/primary'); r.appendChild(d); }
  return r;
}
async function optionRow(parent, iconName, title, sub, selected) {
  const r = auto(title, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 12); padV(r, 14, 16, 14, 16);
  bindRadius(r, 'card'); fillV(r, 'surface/card');
  strokeV(r, selected ? 'brand/primary' : 'border/subtle', selected ? 2 : 1);
  put(parent, r, true);
  if (iconName) { const cir = circ('Icon circle', 40, 'brand/primary-soft'); cir.appendChild(ic(iconName, 'brand/primary', 20)); r.appendChild(cir); }
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  col.appendChild(await tx(title, 'Body/15 Regular', 'text/primary', 'Title'));
  if (sub) { const s = await tx(sub, 'Caption/13 Regular', 'text/secondary', 'Subtitle'); col.appendChild(s); fillW(s, 2); }
  r.appendChild(radio(selected));
  return r;
}
async function priceRow(label, value) {
  const r = auto('Price', 'HORIZONTAL'); r.primaryAxisAlignItems = 'SPACE_BETWEEN'; r.counterAxisAlignItems = 'CENTER';
  r.appendChild(await tx(label, 'Body/14 Medium', 'text/secondary', 'Label'));
  r.appendChild(await tx(value, 'Heading/18 SemiBold', 'text/primary', 'Value'));
  return r;
}
async function iconLine(parent, iconName, text) {
  const r = auto(text.slice(0, 24), 'HORIZONTAL'); gapV(r, 12); r.counterAxisAlignItems = 'MIN';
  put(parent, r, true);
  r.appendChild(ic(iconName, 'text/secondary', 20));
  const t = await tx(text, 'Body/14 Medium', 'text/primary', 'Text');
  r.appendChild(t); fillW(t);
  return r;
}
async function doctorMini(parent, name, sub, initials, tone) {
  const r = auto('Doctor', 'HORIZONTAL'); gapV(r, 12); r.counterAxisAlignItems = 'CENTER';
  put(parent, r, true);
  r.appendChild(avatar('M', tone || 'Teal', initials));
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  col.appendChild(await tx(name, 'Subheading/16 SemiBold', 'text/primary', 'Name'));
  const s = await tx(sub, 'Caption/13 Regular', 'text/secondary', 'Sub'); col.appendChild(s); fillW(s, 1);
  return r;
}
async function successHero(parent, title, sub) {
  const h = block(parent, 'Success', 16);
  h.counterAxisAlignItems = 'CENTER';
  const ring = circ('Success ring', 128, 'accent/teal-soft');
  const inner = circ('Tick circle', 88, 'accent/teal');
  inner.appendChild(ic('Tick', 'text/inverse', 44));
  ring.appendChild(inner);
  h.appendChild(ring);
  const t = await tx(title, 'Display/28 Bold', 'text/primary', 'Title');
  h.appendChild(t); fillW(t); t.textAlignHorizontal = 'CENTER';
  const s = await tx(sub, 'Body/15 Regular', 'text/secondary', 'Subtitle');
  h.appendChild(s); fillW(s); s.textAlignHorizontal = 'CENTER';
  return h;
}
async function bookingIdRow(parent, id) {
  const r = auto('Booking ID', 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; r.primaryAxisAlignItems = 'SPACE_BETWEEN';
  padV(r, 4, 0, 12, 0);
  put(parent, r, true);
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  r.appendChild(col);
  col.appendChild(await tx('Booking ID', 'Micro/12 Medium', 'text/secondary', 'Label'));
  col.appendChild(await tx(id, 'Heading/18 SemiBold', 'text/primary', 'Value'));
  const copy = variant('IconButton', 'Style=Soft'); copy.name = 'Copy booking ID';
  setProps(copy, { Icon: HI.Copy.id });
  r.appendChild(copy);
  divider(parent);
}
function dayStrip(parent, days) {
  const strip = auto('Days', 'HORIZONTAL'); strip.primaryAxisAlignItems = 'SPACE_BETWEEN';
  put(parent, strip, true);
  for (const d of days) {
    const p = variant('DayPill', 'State=' + d[2]);
    strip.appendChild(p);
    setProps(p, { Day: d[0], Date: d[1] });
  }
}
async function slotGroup(parent, label, slots) {
  const g = block(parent, label, 8);
  g.appendChild(await tx(label, 'Body/14 Medium', 'text/secondary', 'Group label'));
  const grid = auto('Slots', 'HORIZONTAL');
  put(g, grid, true);
  grid.layoutWrap = 'WRAP'; grid.itemSpacing = 8; grid.counterAxisSpacing = 8;
  for (const s of slots) {
    const ts = variant('TimeSlot', 'State=' + s[1]);
    grid.appendChild(ts);
    setProps(ts, { Time: s[0] });
  }
}
const WEEK = [['Tue', '17'], ['Wed', '18'], ['Thu', '19'], ['Fri', '20'], ['Sat', '21'], ['Sun', '22'], ['Mon', '23']];

// ---- 15. Specialties ----
async function a5Specialties(sec) {
  const f = newScreen(sec, 'Specialties');
  topBar(f, 'Book a doctor', null);
  const c = content(f, 'Content', 8, 140, 20);
  const sb = HSET.SearchBar.createInstance(); sb.name = 'SearchBar';
  put(c, sb, true);
  setProps(sb, { Placeholder: 'Search a doctor, specialty or symptom' });
  const b = block(c, 'Specialties', 12);
  sectionHead(b, 'Choose a specialty', null);
  const SP = [['Stethoscope', 'General physician'], ['Baby', 'Paediatrics'], ['Female', 'Gynaecology'], ['Sun', 'Dermatology'],
    ['Heart Pulse', 'Cardiology'], ['Bone', 'Orthopaedics'], ['Ear', 'ENT'], ['Tooth', 'Dentistry'],
    ['Eye', 'Eye care'], ['Brain', 'Neurology'], ['Droplet', 'Diabetes care'], ['Heart', 'Mental health']];
  for (let i = 0; i < SP.length; i += 3) {
    const row = auto('Row', 'HORIZONTAL'); gapV(row, 12);
    put(b, row, true);
    for (const s of SP.slice(i, i + 3)) {
      const t = auto('Specialty / ' + s[1], 'VERTICAL'); t.counterAxisAlignItems = 'CENTER'; gapV(t, 8); padV(t, 16, 8, 16, 8);
      cardStyle(t);
      put(row, t, true);
      const cir = circ('Icon circle', 48, 'brand/primary-soft');
      cir.appendChild(ic(s[0], 'brand/primary', 24));
      t.appendChild(cir);
      const l = await tx(s[1], 'Body/14 Medium', 'text/primary', 'Label');
      l.textAlignHorizontal = 'CENTER';
      t.appendChild(l); fillW(l, 2);
    }
    // equal tile heights in a row (a 2-line label shouldn't make one tile taller)
    row.children.forEach(function (t) { try { t.layoutSizingVertical = 'FILL'; } catch (e) { /* cosmetic */ } });
  }
  const tip = auto('Tip', 'HORIZONTAL'); gapV(tip, 12); padV(tip, 14, 14, 14, 14); bindRadius(tip, 'card'); fillV(tip, 'accent/teal-soft');
  put(c, tip, true);
  tip.appendChild(ic('Info', 'accent/teal-text', 20));
  const tt = await tx('Not sure who to see? Start with a general physician. They\'ll refer you if needed.', 'Body/14 Medium', 'accent/teal-text', 'Text');
  tip.appendChild(tt); fillW(tt);
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 16. Doctor list ----
async function a5DoctorList(sec) {
  const f = newScreen(sec, 'Doctor list');
  topBar(f, 'Paediatricians', 'Search');
  const c = content(f, 'Content', 8, 140, 16);
  const fl = hScroll(c, 'Filters', 8);
  ['Available today', 'Fee under ₹700', '10+ yrs experience', '4.5★ and above', 'Female doctor'].forEach(function (l, i) { fl.appendChild(chip(l, i === 0)); });
  const sr = auto('Results bar', 'HORIZONTAL'); sr.primaryAxisAlignItems = 'SPACE_BETWEEN'; sr.counterAxisAlignItems = 'CENTER';
  put(c, sr, true);
  sr.appendChild(await tx('12 doctors near Indiranagar', 'Body/14 Medium', 'text/secondary', 'Count'));
  const sort = auto('Sort', 'HORIZONTAL'); gapV(sort, 4); sort.counterAxisAlignItems = 'CENTER'; sort.resize(80, 44); sort.counterAxisSizingMode = 'FIXED';
  sort.appendChild(ic('Sort', 'brand/primary', 18));
  sort.appendChild(await tx('Relevance', 'Body/14 Medium', 'brand/primary', 'Label'));
  sr.appendChild(sort);
  const DOCS = [
    null,
    { p: { Name: 'Dr. Sameer Kulkarni', Specialty: 'Paediatrician', Experience: '9 yrs exp · English, Hindi, Marathi', 'Rating value': '4.7', Reviews: '(198 reviews)', 'Fee value': '₹500', 'Next slot': 'Today, 6:00 PM' }, a: ['SK', 'Navy'] },
    { p: { Name: 'Dr. Lakshmi Narayan', Specialty: 'Paediatrician', Experience: '20 yrs exp · English, Kannada, Tamil', 'Rating value': '4.9', Reviews: '(640 reviews)', 'Fee value': '₹900', 'Next slot': 'Today, 7:30 PM' }, a: ['LN', 'Amber'] },
  ];
  for (const d of DOCS) {
    const card = HSET.DoctorCard.createInstance(); card.name = 'DoctorCard / ' + (d ? d.p.Name : 'Dr. Ananya Rao');
    put(c, card, true);
    if (d) { setProps(card, d.p); setProps(exposed(card, 'Avatar'), { Initials: d.a[0], Tone: d.a[1] }); }
  }
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 17. Doctor profile ----
async function a5DoctorProfile(sec) {
  const f = newScreen(sec, 'Doctor profile');
  topBar(f, 'Doctor profile', 'Share');
  const c = content(f, 'Content', 8, 200, 20);
  const head = auto('Header', 'HORIZONTAL'); gapV(head, 16); head.counterAxisAlignItems = 'CENTER';
  put(c, head, true);
  head.appendChild(avatar('L', 'Teal', 'AR'));
  const hc = auto('Text', 'VERTICAL'); gapV(hc, 4);
  put(head, hc, true);
  hc.appendChild(await tx('Dr. Ananya Rao', 'Title/22 SemiBold', 'text/primary', 'Name'));
  hc.appendChild(await tx('Paediatrician', 'Body/15 Regular', 'text/secondary', 'Specialty'));
  hc.appendChild(pill('Verified'));
  const st = auto('Stats', 'HORIZONTAL'); gapV(st, 8);
  put(c, st, true);
  await stat(st, 'Experience', '12 years');
  await stat(st, 'Rating', '4.8 (312)');
  await stat(st, 'Patients', '3,200+');
  const about = cardBox(c, 'About', 16, 12);
  about.appendChild(await tx('About', 'Subheading/16 SemiBold', 'text/primary', 'Title'));
  const at = await tx('Child health from newborn care to teens: vaccines, growth checks, fevers, allergies and asthma. Calm with first-time parents.', 'Body/15 Regular', 'text/secondary', 'Text');
  about.appendChild(at); fillW(at);
  await iconLine(about, 'Graduation', 'MBBS, MD (Paediatrics), St. John\'s Medical College');
  await iconLine(about, 'Language', 'English, Hindi, Kannada');
  await iconLine(about, 'Shield Tick', 'Karnataka Medical Council reg. 54321');
  const clinic = cardBox(c, 'Clinic', 16, 12);
  clinic.appendChild(await tx('Rainbow Children\'s Clinic', 'Subheading/16 SemiBold', 'text/primary', 'Title'));
  const map = figma.createFrame(); map.name = 'Map preview'; map.resize(321, 120); map.clipsContent = true;
  bindRadius(map, 'button'); fillV(map, 'brand/primary-soft');
  put(clinic, map, true);
  [[-20, 40, 400, 10, 0], [-20, 88, 400, 6, 0], [90, -20, 8, 200, 0], [210, -20, 10, 200, 0]].forEach(function (s) {
    const r = figma.createRectangle(); r.name = 'Street'; r.resize(s[2], s[3]); fillV(r, 'surface/card');
    map.appendChild(r); r.x = s[0]; r.y = s[1];
  });
  const pin = circ('Pin', 32, 'brand/primary');
  pin.appendChild(ic('Location', 'text/inverse', 18));
  map.appendChild(pin); pin.x = 145; pin.y = 28;
  const addr = await tx('12, 80 Feet Road, Indiranagar, Bengaluru 560038 · 1.2 km away', 'Body/14 Medium', 'text/secondary', 'Address');
  clinic.appendChild(addr); fillW(addr);
  clinic.appendChild(btn('Ghost', 'M', 'Get directions', 'Directions'));
  const rev = block(c, 'Reviews', 12);
  sectionHead(rev, 'What parents say', 'See all 312');
  for (const r of [['Neha S.', '2 weeks ago', 'Very patient with my 3-year-old. Explained everything clearly and didn\'t over-prescribe.'],
    ['Rahul M.', '1 month ago', 'On time, gentle and thorough. The clinic is clean and child-friendly.']]) {
    const card = cardBox(rev, 'Review / ' + r[0], 16, 8);
    const top = auto('Top', 'HORIZONTAL'); top.primaryAxisAlignItems = 'SPACE_BETWEEN'; top.counterAxisAlignItems = 'CENTER';
    put(card, top, true);
    top.appendChild(await tx(r[0], 'Body/14 Medium', 'text/primary', 'Name'));
    const stars = auto('Stars', 'HORIZONTAL'); gapV(stars, 2);
    for (let i = 0; i < 5; i++) stars.appendChild(ic('Star Filled', null, 14));
    top.appendChild(stars);
    const t = await tx(r[2], 'Body/14 Medium', 'text/secondary', 'Text'); card.appendChild(t); fillW(t);
    card.appendChild(await tx(r[1], 'Micro/12 Medium', 'text/secondary', 'When'));
  }
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Book appointment')], await priceRow('Consultation fee', '₹600'));
  addIndicator(f);
  return f;
}

// ---- 18. Slot picker ----
async function a5SlotPicker(sec) {
  const f = newScreen(sec, 'Choose a time');
  topBar(f, 'Choose a time', null);
  const c = content(f, 'Content', 8, 200, 20);
  await doctorMini(c, 'Dr. Ananya Rao', 'Paediatrician · Rainbow Children\'s Clinic', 'AR', 'Teal');
  await chipGroup(c, 'Who is this for?', ['Aarav', 'Priya', 'Kabir', 'Sunita'], 2);
  put(c, HSET.SlotPicker.createInstance(), true);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Continue')], await priceRow('Thu, 19 Nov · 4:30 PM', '₹600'));
  addIndicator(f);
  return f;
}

// ---- 19. Review and pay ----
async function a5ReviewPay(sec) {
  const f = newScreen(sec, 'Review and pay');
  topBar(f, 'Review and pay', null);
  const c = content(f, 'Content', 8, 200, 20);
  const sum = cardBox(c, 'Summary', 16, 0);
  await doctorMini(sum, 'Dr. Ananya Rao', 'Paediatrician', 'AR', 'Teal');
  sum.itemSpacing = 0;
  const sp = figma.createFrame(); sp.name = 'Spacer'; sp.resize(10, 8); sp.fills = []; sum.appendChild(sp);
  await kv(sum, 'Patient', 'Kabir Mehta');
  await kv(sum, 'When', 'Thu, 19 Nov · 4:30 PM');
  await kv(sum, 'Where', 'Rainbow Children\'s Clinic, Indiranagar', true);
  const bill = cardBox(c, 'Bill', 16, 0);
  bill.paddingTop = 4; bill.paddingBottom = 4;
  await kv(bill, 'Consultation fee', '₹600');
  await kv(bill, 'Platform fee', 'Free');
  const total = await kv(bill, 'To pay', '₹600', true);
  await total.children[1].setTextStyleIdAsync(HS['Heading/18 SemiBold'].id); // "To pay" amount stands out
  const pay = block(c, 'Payment method', 12);
  pay.appendChild(await tx('Pay with', 'Body/14 Medium', 'text/primary', 'Label'));
  await optionRow(pay, 'Wallet', 'UPI', 'Google Pay, PhonePe, Paytm or any UPI app', true);
  await optionRow(pay, 'Card', 'Debit or credit card', 'Visa, Mastercard, RuPay', false);
  await optionRow(pay, 'Hospital', 'Pay at the clinic', 'Cash or card on the day', false);
  c.appendChild(await tag('Free cancellation up to 2 hours before', 'Tick Circle', 'accent/teal-soft', 'accent/teal-text', 'Cancellation'));
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Pay ₹600', 'Lock')], await priceRow('Total', '₹600'));
  addIndicator(f);
  return f;
}

// ---- 20 / 25. Booking confirmed ----
async function a5Confirmed(sec, name, o) {
  const f = newScreen(sec, name);
  const c = content(f, 'Content', 40, 200, 24);
  await successHero(c, o.title, o.sub);
  const card = cardBox(c, 'Details', 16, 0);
  card.paddingTop = 8; card.paddingBottom = 8;
  await bookingIdRow(card, o.id);
  for (let i = 0; i < o.rows.length; i++) await kv(card, o.rows[i][0], o.rows[i][1], i === o.rows.length - 1);
  const note = auto('Reminder', 'HORIZONTAL'); gapV(note, 12); padV(note, 14, 14, 14, 14); bindRadius(note, 'card'); fillV(note, o.noteTone[0]);
  put(c, note, true);
  note.appendChild(ic(o.noteIcon, o.noteTone[1], 20));
  const nt = await tx(o.note, 'Body/14 Medium', o.noteTone[1], 'Text');
  note.appendChild(nt); fillW(nt);
  // design note for the developer: placed next to the frame (not inside the screen) by runA5b
  f.setPluginData('annotation', 'Motion: the circle springs in, the tick draws itself (stroke-dashoffset), one soft ring pulse + success haptic, then the details card and buttons fade up in a stagger. With reduced motion: no animation.');
  addStatusBar(f);
  footer(f, [btn('Secondary', 'L', 'Back to home'), btn('Primary', 'L', 'View booking')]);
  addIndicator(f);
  return f;
}

// ---- 21. Lab packages ----
async function a5LabPackages(sec) {
  const f = newScreen(sec, 'Lab packages');
  topBar(f, 'Lab tests', 'Search');
  const c = content(f, 'Content', 8, 140, 16);
  put(c, variant('Segmented', 'Active=Left'), true);
  const seg = c.children[c.children.length - 1];
  setProps(seg, { Left: 'Health packages', Right: 'Single tests' });
  const fl = hScroll(c, 'Filters', 8);
  ['All', 'Full body', 'Diabetes', 'Thyroid', 'Senior citizen', 'Child wellness'].forEach(function (l, i) { fl.appendChild(chip(l, i === 0)); });
  const trust = auto('Trust', 'HORIZONTAL'); gapV(trust, 8); trust.counterAxisAlignItems = 'CENTER';
  put(c, trust, true);
  trust.appendChild(ic('Shield Tick', 'accent/teal-text', 18));
  const tt = await tx('NABL-accredited labs · free home sample collection', 'Body/14 Medium', 'accent/teal-text', 'Text');
  trust.appendChild(tt); fillW(tt);
  const PK = [
    null,
    { Name: 'Diabetes care', Tests: '28 tests included', 'Report time': 'Report in 24 h', 'Price value': '₹899', MRP: '₹1,999', Discount: '55% off' },
    { Name: 'Thyroid profile', Tests: '3 tests included (T3, T4, TSH)', 'Report time': 'Report in 12 h', 'Price value': '₹499', MRP: '₹999', Discount: '50% off' },
    { Name: 'Senior citizen checkup', Tests: '86 tests included', 'Report time': 'Report in 48 h', 'Price value': '₹1,999', MRP: '₹4,499', Discount: '56% off' },
    { Name: 'Child wellness', Tests: '34 tests included', 'Report time': 'Report in 24 h', 'Price value': '₹999', MRP: '₹1,999', Discount: '50% off' },
  ];
  for (const p of PK) {
    const card = HSET.LabPackageCard.createInstance(); card.name = 'LabPackageCard / ' + (p ? p.Name : 'Full body checkup');
    put(c, card, true);
    if (p) setProps(card, p);
  }
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 22. Package details ----
async function testGroup(parent, name, count, open, items, last) {
  const g = auto(name, 'VERTICAL'); put(parent, g, true);
  const r = auto('Row', 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 12); padV(r, 14, 0, 14, 0);
  put(g, r, true);
  const t = await tx(name, 'Body/15 Regular', 'text/primary', 'Name'); r.appendChild(t); fillW(t);
  r.appendChild(await tx(count + ' tests', 'Caption/13 Regular', 'text/secondary', 'Count'));
  r.appendChild(ic(open ? 'Chevron Down' : 'Chevron Right', 'text/secondary', 20));
  if (open) {
    const list = auto('Tests', 'VERTICAL'); gapV(list, 8); padV(list, 0, 0, 14, 12);
    put(g, list, true);
    for (const it of items) list.appendChild(await tx('•  ' + it, 'Body/14 Medium', 'text/secondary', 'Test'));
  }
  if (!last) divider(parent);
}
async function a5PackageDetails(sec) {
  const f = newScreen(sec, 'Package details');
  topBar(f, 'Full body checkup', 'Share');
  const c = content(f, 'Content', 8, 200, 20);
  const hero = cardBox(c, 'Hero', 16, 12);
  const tags = auto('Tags', 'HORIZONTAL'); gapV(tags, 8); hero.appendChild(tags);
  tags.appendChild(await tag('Home collection', 'Home', 'accent/teal-soft', 'accent/teal-text', 'Home collection'));
  tags.appendChild(await tag('NABL lab', 'Shield Tick', 'brand/primary-soft', 'brand/primary', 'NABL'));
  hero.appendChild(await tx('Full body checkup', 'Title/22 SemiBold', 'text/primary', 'Name'));
  const ht = await tx('A yearly check of blood count, sugar, cholesterol, liver, kidney, thyroid and vitamins. By Lal PathLabs.', 'Body/15 Regular', 'text/secondary', 'About');
  hero.appendChild(ht); fillW(ht);
  const pr = auto('Price', 'HORIZONTAL'); gapV(pr, 8); pr.counterAxisAlignItems = 'CENTER'; hero.appendChild(pr);
  pr.appendChild(await tx('₹1,299', 'Title/22 SemiBold', 'text/primary', 'Price'));
  const mrp = await tx('₹2,999', 'Body/15 Regular', 'text/secondary', 'MRP'); mrp.textDecoration = 'STRIKETHROUGH'; pr.appendChild(mrp);
  pr.appendChild(await tx('57% off', 'Body/14 Medium', 'accent/teal-text', 'Discount'));
  const st = auto('Facts', 'HORIZONTAL'); gapV(st, 8);
  put(c, st, true);
  await stat(st, 'Tests', '72');
  await stat(st, 'Report in', '24 hours');
  await stat(st, 'Fasting', '10–12 h');
  const prep = auto('Preparation', 'HORIZONTAL'); gapV(prep, 12); padV(prep, 14, 14, 14, 14); bindRadius(prep, 'card'); fillV(prep, 'status/warning-soft');
  put(c, prep, true);
  prep.appendChild(ic('Info', 'status/warning-text', 20));
  const pt = await tx('Fast for 10–12 hours before the sample is taken. Water is fine. Take your usual medicines unless your doctor says otherwise.', 'Body/14 Medium', 'status/warning-text', 'Text');
  prep.appendChild(pt); fillW(pt);
  const inc = block(c, 'Tests included', 8);
  inc.appendChild(await tx('Tests included', 'Heading/18 SemiBold', 'text/primary', 'Title'));
  const box = cardBox(inc, 'List', 16, 0);
  box.paddingTop = 0; box.paddingBottom = 0;
  const G = [['Complete blood count', 24, true, ['Haemoglobin', 'Total WBC count', 'Platelet count', 'RBC indices (MCV, MCH, MCHC)', '+ 20 more']],
    ['Liver function', 12], ['Kidney function', 8], ['Thyroid profile', 3], ['Lipid profile', 8], ['Diabetes (HbA1c, fasting sugar)', 3], ['Vitamins D and B12', 2], ['Urine routine', 12]];
  for (let i = 0; i < G.length; i++) await testGroup(box, G[i][0], G[i][1], !!G[i][2], G[i][3] || [], i === G.length - 1);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Select members')], await priceRow('Per person', '₹1,299'));
  addIndicator(f);
  return f;
}

// ---- 23. Members and address ----
async function memberPick(parent, name, sub, initials, tone, checked, disabled) {
  const r = auto(name, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 12); padV(r, 12, 16, 12, 16);
  bindRadius(r, 'card'); fillV(r, 'surface/card'); strokeV(r, checked ? 'brand/primary' : 'border/subtle', checked ? 2 : 1);
  put(parent, r, true);
  if (disabled) r.opacity = 0.55;
  r.appendChild(avatar('S', tone, initials));
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  col.appendChild(await tx(name, 'Body/15 Regular', 'text/primary', 'Name'));
  const s = await tx(sub, 'Caption/13 Regular', 'text/secondary', 'Sub'); col.appendChild(s); fillW(s);
  r.appendChild(checkbox(checked));
}
async function a5MembersAddress(sec) {
  const f = newScreen(sec, 'Members and address');
  topBar(f, 'Who\'s getting tested?', null);
  const c = content(f, 'Content', 8, 200, 20);
  const m = block(c, 'Members', 8);
  m.appendChild(await tx('Full body checkup · ₹1,299 per person', 'Body/14 Medium', 'text/secondary', 'Package'));
  await memberPick(m, 'Aarav Mehta', 'You · 34 yrs', 'A', 'Navy', true);
  await memberPick(m, 'Priya Mehta', 'Spouse · 32 yrs', 'P', 'Teal', true);
  await memberPick(m, 'Sunita Mehta', 'Mother · 68 yrs · try the Senior citizen checkup', 'S', 'Navy', false);
  await memberPick(m, 'Kabir Mehta', 'Son · 6 yrs · this package is for adults', 'K', 'Amber', false, true);
  const a = block(c, 'Address', 8);
  a.appendChild(await tx('Sample collection address', 'Body/14 Medium', 'text/primary', 'Label'));
  await optionRow(a, 'Home', 'Home', '#42, 5th Cross, HAL 2nd Stage, Indiranagar, Bengaluru 560038', true);
  await optionRow(a, 'Hospital', 'Office', '4th floor, Embassy Golf Links, Domlur, Bengaluru 560071', false);
  a.appendChild(btn('Ghost', 'M', 'Add a new address', 'Plus'));
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Pick a time')], await priceRow('2 people', '₹2,598'));
  addIndicator(f);
  return f;
}

// ---- 24. Lab slot ----
async function a5LabSlot(sec) {
  const f = newScreen(sec, 'Lab collection time');
  topBar(f, 'Sample collection time', null);
  const c = content(f, 'Content', 8, 200, 20);
  const note = auto('Note', 'HORIZONTAL'); gapV(note, 12); padV(note, 14, 14, 14, 14); bindRadius(note, 'card'); fillV(note, 'brand/primary-soft');
  put(c, note, true);
  note.appendChild(ic('Home', 'brand/primary', 20));
  const nt = await tx('A trained phlebotomist visits your home. Early slots work best for fasting tests.', 'Body/14 Medium', 'brand/primary', 'Text');
  note.appendChild(nt); fillW(nt);
  c.appendChild(await tx('November 2026', 'Subheading/16 SemiBold', 'text/primary', 'Month'));
  dayStrip(c, WEEK.map(function (d) { return [d[0], d[1], d[1] === '21' ? 'Selected' : d[1] === '17' ? 'Disabled' : 'Default']; }));
  await slotGroup(c, 'Early morning (best for fasting)', [['6:30 AM', 'Default'], ['7:00 AM', 'Selected'], ['7:30 AM', 'Default'], ['8:00 AM', 'Disabled'], ['8:30 AM', 'Default'], ['9:00 AM', 'Default']]);
  await slotGroup(c, 'Later morning', [['10:00 AM', 'Default'], ['10:30 AM', 'Disabled'], ['11:00 AM', 'Default']]);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Review booking')], await priceRow('Sat, 21 Nov · 7:00 AM', '₹2,598'));
  addIndicator(f);
  return f;
}

// ---- 26. Report ready ----
async function resultRow(parent, name, value, range, status, last) {
  const r = auto(name, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 12); padV(r, 12, 0, 12, 0);
  put(parent, r, true);
  const col = auto('Test', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  col.appendChild(await tx(name, 'Body/15 Regular', 'text/primary', 'Name'));
  col.appendChild(await tx('Range ' + range, 'Caption/13 Regular', 'text/secondary', 'Range'));
  const right = auto('Result', 'VERTICAL'); gapV(right, 4); right.counterAxisAlignItems = 'MAX';
  r.appendChild(right);
  right.appendChild(await tx(value, 'Subheading/16 SemiBold', 'text/primary', 'Value'));
  const TONE = { Normal: ['Tick', 'accent/teal-soft', 'accent/teal-text'], High: ['Warning', 'status/danger-soft', 'status/danger-text'],
    Borderline: ['Info', 'status/warning-soft', 'status/warning-text'], Low: ['Info', 'status/warning-soft', 'status/warning-text'] };
  const t = TONE[status];
  right.appendChild(await tag(status, t[0], t[1], t[2], 'Status'));
  if (!last) divider(parent);
}
async function a5ReportReady(sec) {
  const f = newScreen(sec, 'Report ready');
  topBar(f, 'Lab report', 'Share');
  const c = content(f, 'Content', 8, 200, 20);
  const banner = auto('Report ready banner', 'HORIZONTAL'); gapV(banner, 12); padV(banner, 14, 14, 14, 14); banner.counterAxisAlignItems = 'CENTER';
  bindRadius(banner, 'card'); fillV(banner, 'accent/teal-soft');
  put(c, banner, true);
  banner.appendChild(ic('Tick Circle', 'accent/teal-text', 24));
  const bc = auto('Text', 'VERTICAL'); gapV(bc, 2); put(banner, bc, true);
  bc.appendChild(await tx('Report ready', 'Subheading/16 SemiBold', 'accent/teal-text', 'Title'));
  const bt = await tx('Saved to Aarav\'s records. We\'ve also sent it to your email.', 'Caption/13 Regular', 'accent/teal-text', 'Text'); bc.appendChild(bt); fillW(bt);
  const head = block(c, 'Report', 4);
  head.appendChild(await tx('Full body checkup', 'Title/22 SemiBold', 'text/primary', 'Title'));
  const hs = await tx('Aarav Mehta · Lal PathLabs · collected Sat 21 Nov, reported Sun 22 Nov', 'Caption/13 Regular', 'text/secondary', 'Meta');
  head.appendChild(hs); fillW(hs);
  const sum = auto('Summary', 'HORIZONTAL'); gapV(sum, 8);
  put(c, sum, true);
  sum.appendChild(await tag('67 normal', 'Tick', 'accent/teal-soft', 'accent/teal-text', 'Normal'));
  sum.appendChild(await tag('4 to watch', 'Info', 'status/warning-soft', 'status/warning-text', 'Watch'));
  sum.appendChild(await tag('1 high', 'Warning', 'status/danger-soft', 'status/danger-text', 'High'));
  const res = block(c, 'Results to look at', 8);
  res.appendChild(await tx('Results to look at', 'Heading/18 SemiBold', 'text/primary', 'Title'));
  const box = cardBox(res, 'Results', 16, 0);
  box.paddingTop = 0; box.paddingBottom = 0;
  const R = [['Fasting blood sugar', '108 mg/dL', '70–100', 'High'], ['HbA1c', '5.9 %', 'below 5.7', 'Borderline'], ['LDL cholesterol', '128 mg/dL', 'below 100', 'Borderline'],
    ['Vitamin D', '22 ng/mL', '30–100', 'Low'], ['Haemoglobin', '14.2 g/dL', '13–17', 'Normal']];
  for (let i = 0; i < R.length; i++) await resultRow(box, R[i][0], R[i][1], R[i][2], R[i][3], i === R.length - 1);
  const dis = await tx('Ranges are from the lab. HealthHub doesn\'t give medical advice. Please discuss these results with your doctor.', 'Caption/13 Regular', 'text/secondary', 'Disclaimer');
  c.appendChild(dis); fillW(dis);
  c.appendChild(btn('Secondary', 'M', 'Book a follow-up with a doctor', 'Stethoscope'));
  addStatusBar(f);
  footer(f, [btn('Secondary', 'L', 'Share', 'Share'), btn('Primary', 'L', 'PDF', 'Download')]);
  addIndicator(f);
  return f;
}

async function runA5b() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found. Run A4 first.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();
  await loadA3(page);
  for (const n of ['DoctorCard', 'LabPackageCard', 'SlotPicker', 'DayPill', 'TimeSlot']) if (!HSET[n]) throw new Error('Component ' + n + ' missing (re-run A3).');
  const addedIcons = await ensureIcons(page);
  const patched = patchComponents();
  STATUS_TEMPLATE = findStatusBar(home);

  const NAME = 'HealthHub / A5b screens';
  const old = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === NAME; })[0];
  let pos;
  if (old) { pos = { x: old.x, y: old.y }; old.remove(); }
  else {
    const a = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / A5a screens'; })[0];
    if (!a) throw new Error('Run A5a first (its section sets where A5b goes).');
    pos = { x: a.x, y: Math.round(a.y + a.height + 400) };
  }
  const sec = figma.createSection();
  sec.name = NAME;
  page.appendChild(sec);
  sec.x = pos.x; sec.y = pos.y;

  const frames = [];
  try {
    frames.push(await a5Specialties(sec));
    frames.push(await a5DoctorList(sec));
    frames.push(await a5DoctorProfile(sec));
    frames.push(await a5SlotPicker(sec));
    frames.push(await a5ReviewPay(sec));
    frames.push(await a5Confirmed(sec, 'Booking confirmed', {
      title: 'Booking confirmed', sub: 'Kabir\'s check-up is booked. We\'ve sent the details to +91 98450 12345.', id: 'HH-4K2P9Q',
      rows: [['Doctor', 'Dr. Ananya Rao'], ['Patient', 'Kabir Mehta'], ['When', 'Thu, 19 Nov · 4:30 PM'], ['Where', 'Rainbow Children\'s Clinic, Indiranagar'], ['Paid', '₹600 by UPI']],
      note: 'We\'ll remind you 24 hours and 2 hours before.', noteIcon: 'Bell', noteTone: ['brand/primary-soft', 'brand/primary'],
    }));
    frames.push(await a5LabPackages(sec));
    frames.push(await a5PackageDetails(sec));
    frames.push(await a5MembersAddress(sec));
    frames.push(await a5LabSlot(sec));
    frames.push(await a5Confirmed(sec, 'Lab booking confirmed', {
      title: 'Lab test booked', sub: 'A phlebotomist will come to your home. We\'ve sent the details by SMS.', id: 'HH-7Q3M1Z',
      rows: [['Test', 'Full body checkup'], ['For', 'Aarav and Priya'], ['When', 'Sat, 21 Nov · 7:00 AM'], ['Where', 'Home, Indiranagar'], ['Paid', '₹2,598 by UPI']],
      note: 'Remember to fast for 10–12 hours before. We\'ll remind you the night before.', noteIcon: 'Info', noteTone: ['status/warning-soft', 'status/warning-text'],
    }));
    frames.push(await a5ReportReady(sec));
  } catch (e) {
    sec.remove();
    throw e;
  }

  const bg = [];
  for (const f of frames) bg.push(await fixBg(f));
  frames.forEach(function (f, i) { f.x = 40 + (i % 6) * (SW + 80); f.y = 80 + Math.floor(i / 6) * (SH + 120); });
  sec.resizeWithoutConstraints(40 + 6 * (SW + 80), 80 + 2 * (SH + 120) + 40);
  // developer notes sit under their frame, outside the screen
  for (const f of frames) {
    const note = f.getPluginData('annotation');
    if (!note) continue;
    const t = await tx(note, 'Caption/13 Regular', 'text/secondary', 'Note / ' + f.name.replace('HealthHub / ', ''));
    sec.appendChild(t);
    t.textAutoResize = 'HEIGHT'; t.resize(SW, t.height);
    t.x = f.x; t.y = f.y + SH + 16;
  }
  figma.currentPage.selection = [sec];
  figma.viewport.scrollAndZoomIntoView([sec]);

  const ex = await exportScreens(page, frames, 'a5b-');
  NOTES5.forEach(function (n) { console.log('[A5b] ' + n); });
  await upload('a5b-screens', {
    generatedAt: new Date().toISOString(), notes: NOTES5, addedIcons: addedIcons, patched: patched, background: bg, contentHeights: ex.heights,
    section: { id: sec.id, x: sec.x, y: sec.y }, frames: frames.map(function (f) { return { id: f.id, name: f.name }; }),
  }, ex.pngs);
  const bad = bg.filter(function (d) { return !d.ok; }).length;
  return (bad ? '⚠ ' : '✓ ') + 'A5b: ' + frames.length + ' new screens in "' + NAME + '"' + (addedIcons.length ? ', ' + addedIcons.length + ' icons added to the kit' : '') +
    (patched.length ? ', ' + patched.length + ' component fix(es)' : '') +
    (bad ? '; ' + bad + ' background(s) still dark' : '') + '.';
}

// =====================================================================
// A5c · New screens 27–37 (appointment, reminders, ABHA, privacy, help, states)
// =====================================================================

function mapPreview(parent, h) {
  const map = figma.createFrame(); map.name = 'Map preview'; map.resize(321, h || 120); map.clipsContent = true;
  bindRadius(map, 'button'); fillV(map, 'brand/primary-soft');
  put(parent, map, true);
  [[-20, 40, 400, 10], [-20, 88, 400, 6], [90, -20, 8, 220], [210, -20, 10, 220]].forEach(function (s) {
    const r = figma.createRectangle(); r.name = 'Street'; r.resize(s[2], s[3]); fillV(r, 'surface/card');
    map.appendChild(r); r.x = s[0]; r.y = s[1];
  });
  const pin = circ('Pin', 32, 'brand/primary');
  pin.appendChild(ic('Location', 'text/inverse', 18));
  map.appendChild(pin); pin.x = 145; pin.y = Math.round((h || 120) / 2 - 32);
  return map;
}
function toggle(on) {
  const t = auto('Toggle ' + (on ? 'on' : 'off'), 'HORIZONTAL'); fixed(t, 44, 26); bindRadius(t, 'pill');
  t.paddingLeft = t.paddingRight = 3; t.counterAxisAlignItems = 'CENTER'; t.primaryAxisAlignItems = on ? 'MAX' : 'MIN';
  fillV(t, on ? 'brand/primary' : 'border/strong');
  const k = figma.createEllipse(); k.name = 'Knob'; k.resize(20, 20); fillV(k, 'surface/card');
  t.appendChild(k);
  return t;
}
async function settingRow(parent, title, sub, on, last) {
  const r = auto(title, 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 16); padV(r, 14, 0, 14, 0);
  put(parent, r, true);
  const col = auto('Text', 'VERTICAL'); gapV(col, 2);
  put(r, col, true);
  col.appendChild(await tx(title, 'Body/15 Regular', 'text/primary', 'Title'));
  if (sub) { const s = await tx(sub, 'Caption/13 Regular', 'text/secondary', 'Sub'); col.appendChild(s); fillW(s, 2); }
  r.appendChild(toggle(on));
  if (!last) divider(parent);
}
function bone(parent, w, h, r, fill) {
  const b = figma.createRectangle(); b.name = 'Skeleton'; b.resize(w, h); b.cornerRadius = r === undefined ? 8 : r;
  fillV(b, 'border/subtle');
  parent.appendChild(b);
  if (fill) b.layoutSizingHorizontal = 'FILL';
  return b;
}
async function noteBox(parent, iconName, text, tone) {
  const n = auto('Note', 'HORIZONTAL'); gapV(n, 12); padV(n, 14, 14, 14, 14); bindRadius(n, 'card'); fillV(n, tone[0]);
  put(parent, n, true);
  n.appendChild(ic(iconName, tone[1], 20));
  const t = await tx(text, 'Body/14 Medium', tone[1], 'Text');
  n.appendChild(t); fillW(t);
  return n;
}
const T_NAVY = ['brand/primary-soft', 'brand/primary'], T_TEAL = ['accent/teal-soft', 'accent/teal-text'], T_AMBER = ['status/warning-soft', 'status/warning-text'];

// ---- 27. Appointment details ----
async function a5ApptDetails(sec) {
  const f = newScreen(sec, 'Appointment details');
  topBar(f, 'Appointment', 'More');
  const c = content(f, 'Content', 8, 160, 16);
  const when = cardBox(c, 'When', 16, 12);
  const pr = auto('Status', 'HORIZONTAL'); gapV(pr, 8); pr.counterAxisAlignItems = 'CENTER'; when.appendChild(pr);
  pr.appendChild(pill('Upcoming'));
  pr.appendChild(await tx('In 2 days', 'Body/14 Medium', 'text/secondary', 'Countdown'));
  const dt = auto('Date and time', 'HORIZONTAL'); gapV(dt, 8); dt.counterAxisAlignItems = 'CENTER'; when.appendChild(dt);
  dt.appendChild(await tx('Thu, 19 Nov', 'Title/22 SemiBold', 'text/primary', 'Date'));
  dt.appendChild(await tx('·', 'Title/22 SemiBold', 'text/secondary', 'Separator'));
  dt.appendChild(await tx('4:30 PM', 'Title/22 SemiBold', 'text/primary', 'Time'));
  const add = btn('Secondary', 'M', 'Add to calendar', 'Calendar');
  put(when, add, true);
  const doc = cardBox(c, 'Doctor', 16, 12);
  await doctorMini(doc, 'Dr. Ananya Rao', 'Paediatrician · 12 yrs exp', 'AR', 'Teal');
  const forRow = auto('Patient', 'HORIZONTAL'); gapV(forRow, 8); forRow.counterAxisAlignItems = 'CENTER'; doc.appendChild(forRow);
  forRow.appendChild(avatar('S', 'Amber', 'K'));
  forRow.appendChild(await tx('For Kabir Mehta, 6 yrs', 'Body/14 Medium', 'text/primary', 'Patient'));
  const loc = cardBox(c, 'Location', 16, 12);
  loc.appendChild(await tx('Rainbow Children\'s Clinic', 'Subheading/16 SemiBold', 'text/primary', 'Clinic'));
  const addr = await tx('12, 80 Feet Road, Indiranagar, Bengaluru 560038', 'Body/14 Medium', 'text/secondary', 'Address');
  loc.appendChild(addr); fillW(addr);
  mapPreview(loc, 110);
  const acts = auto('Actions', 'HORIZONTAL'); gapV(acts, 12); put(loc, acts, true);
  const d1 = btn('Secondary', 'M', 'Directions', 'Directions'); acts.appendChild(d1); d1.layoutSizingHorizontal = 'FILL';
  const d2 = btn('Secondary', 'M', 'Call clinic', 'Phone'); acts.appendChild(d2); d2.layoutSizingHorizontal = 'FILL';
  await noteBox(c, 'Info', 'Bring Kabir\'s vaccination card and any recent reports. Please arrive 10 minutes early.', T_NAVY);
  const pay = cardBox(c, 'Booking', 16, 0); pay.paddingTop = 4; pay.paddingBottom = 4;
  await kv(pay, 'Booking ID', 'HH-4K2P9Q');
  await kv(pay, 'Paid', '₹600 by UPI', true);
  addStatusBar(f);
  footer(f, [btn('Secondary', 'L', 'Reschedule'), btn('Danger Ghost', 'L', 'Cancel')]);
  addIndicator(f);
  return f;
}

// ---- 28. Reschedule ----
async function a5Reschedule(sec) {
  const f = newScreen(sec, 'Reschedule');
  topBar(f, 'Reschedule', null);
  const c = content(f, 'Content', 8, 200, 20);
  await doctorMini(c, 'Dr. Ananya Rao', 'Paediatrician · for Kabir', 'AR', 'Teal');
  const cur = auto('Current time', 'HORIZONTAL'); gapV(cur, 8); cur.counterAxisAlignItems = 'CENTER'; padV(cur, 12, 14, 12, 14);
  bindRadius(cur, 'button'); fillV(cur, 'surface/card'); strokeV(cur, 'border/subtle', 1);
  put(c, cur, true);
  cur.appendChild(ic('Calendar', 'text/secondary', 18));
  const ct = await tx('Currently Thu, 19 Nov · 4:30 PM', 'Body/14 Medium', 'text/secondary', 'Text'); cur.appendChild(ct); fillW(ct);
  c.appendChild(await tx('November 2026', 'Subheading/16 SemiBold', 'text/primary', 'Month'));
  dayStrip(c, WEEK.map(function (d) { return [d[0], d[1], d[1] === '20' ? 'Selected' : d[1] === '22' ? 'Disabled' : 'Default']; }));
  await slotGroup(c, 'Morning', [['10:00 AM', 'Default'], ['10:30 AM', 'Disabled'], ['11:00 AM', 'Default'], ['11:30 AM', 'Selected'], ['12:00 PM', 'Default'], ['12:30 PM', 'Disabled']]);
  await slotGroup(c, 'Evening', [['4:30 PM', 'Disabled'], ['5:00 PM', 'Default'], ['5:30 PM', 'Default']]);
  c.appendChild(await tag('Free to reschedule up to 2 hours before', 'Tick Circle', 'accent/teal-soft', 'accent/teal-text', 'Policy'));
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Confirm new time')], await priceRow('New time', 'Fri, 20 Nov · 11:30 AM'));
  addIndicator(f);
  return f;
}

// ---- 29. Cancel (bottom sheet over appointment details) ----
async function a5CancelSheet(sec, details) {
  const f = details.clone();
  sec.appendChild(f);
  f.name = 'HealthHub / Cancel appointment';
  const scrim = figma.createRectangle(); scrim.name = 'Scrim'; scrim.resize(SW, SH); fillV(scrim, 'text/primary'); scrim.opacity = 0.5;
  absolute(f, scrim, 0, 0, { horizontal: 'STRETCH', vertical: 'STRETCH' });
  const sheet = auto('Bottom sheet', 'VERTICAL'); gapV(sheet, 16); padV(sheet, 8, 20, 34, 20); sheet.counterAxisAlignItems = 'CENTER';
  fillV(sheet, 'surface/card');
  sheet.setBoundVariable('topLeftRadius', HV['radius/sheet']); sheet.setBoundVariable('topRightRadius', HV['radius/sheet']);
  sheet.resize(SW, 10); sheet.counterAxisSizingMode = 'FIXED'; sheet.primaryAxisSizingMode = 'AUTO';
  const grab = figma.createRectangle(); grab.name = 'Grabber'; grab.resize(40, 4); bindRadius(grab, 'pill'); fillV(grab, 'border/strong');
  sheet.appendChild(grab);
  const t = await tx('Cancel this appointment?', 'Heading/18 SemiBold', 'text/primary', 'Title');
  sheet.appendChild(t); fillW(t);
  const m = await tx('Dr. Ananya Rao, Thu 19 Nov at 4:30 PM. You\'ll get a full refund of ₹600 to your UPI account in 3–5 working days.', 'Body/15 Regular', 'text/secondary', 'Message');
  sheet.appendChild(m); fillW(m);
  const g = await chipGroup(sheet, 'Reason (optional)', ['Can\'t make it', 'Booked by mistake', 'Feeling better', 'Found another doctor', 'Other'], 0);
  g.layoutSizingHorizontal = 'FILL';
  const row = auto('Buttons', 'HORIZONTAL'); gapV(row, 12); put(sheet, row, true);
  const k = btn('Secondary', 'L', 'Keep it'); row.appendChild(k); k.layoutSizingHorizontal = 'FILL';
  const x = btn('Danger', 'L', 'Yes, cancel'); row.appendChild(x); x.layoutSizingHorizontal = 'FILL';
  absolute(f, sheet, 0, 0, { horizontal: 'STRETCH', vertical: 'MAX' });
  sheet.y = SH - sheet.height;
  const ind = f.findChild(function (n) { return n.name === 'Home indicator'; });
  if (ind) f.appendChild(ind); // keep the indicator on top
  return f;
}

// ---- 30. Reminders ----
async function doseRow(parent, d, last) {
  const r = auto(d.time + ' ' + d.name, 'HORIZONTAL'); gapV(r, 12); padV(r, 14, 0, 14, 0);
  put(parent, r, true);
  const time = auto('Time', 'VERTICAL'); time.resize(64, 10); time.counterAxisSizingMode = 'FIXED';
  r.appendChild(time);
  time.appendChild(await tx(d.time, 'Body/14 Medium', d.done ? 'text/secondary' : 'text/primary', 'Time'));
  const col = auto('Dose', 'VERTICAL'); gapV(col, 4); put(r, col, true);
  col.appendChild(await tx(d.name, 'Subheading/16 SemiBold', 'text/primary', 'Name'));
  const s = await tx(d.sub, 'Caption/13 Regular', 'text/secondary', 'Detail'); col.appendChild(s); fillW(s);
  if (d.done) col.appendChild(await tag(d.done, 'Tick', 'accent/teal-soft', 'accent/teal-text', 'Taken'));
  else {
    const a = auto('Actions', 'HORIZONTAL'); gapV(a, 8); col.appendChild(a);
    a.appendChild(btn('Secondary', 'M', 'Taken', 'Tick'));
    a.appendChild(btn('Ghost', 'M', 'Skip'));
  }
  if (!last) divider(parent);
}
async function a5Reminders(sec) {
  const f = newScreen(sec, 'Reminders');
  topBar(f, 'Reminders', 'Plus');
  const c = content(f, 'Content', 8, 140, 20);
  const m = hScroll(c, 'Member filter', 8);
  ['Everyone', 'Aarav', 'Priya', 'Kabir', 'Sunita'].forEach(function (l, i) { m.appendChild(chip(l, i === 0)); });
  const streak = auto('Streak', 'HORIZONTAL'); gapV(streak, 12); padV(streak, 14, 16, 14, 16); streak.counterAxisAlignItems = 'CENTER';
  bindRadius(streak, 'card'); fillV(streak, 'accent/teal-soft');
  put(c, streak, true);
  const sc = circ('Icon circle', 44, 'surface/card'); sc.appendChild(ic('Heart Pulse', 'accent/teal-text', 22)); streak.appendChild(sc);
  const st = auto('Text', 'VERTICAL'); gapV(st, 2); put(streak, st, true);
  st.appendChild(await tx('12-day streak', 'Subheading/16 SemiBold', 'accent/teal-text', 'Title'));
  const sst = await tx('Sunita hasn\'t missed a dose since 5 Nov.', 'Caption/13 Regular', 'accent/teal-text', 'Sub'); st.appendChild(sst); fillW(sst);
  const today = block(c, 'Today', 8);
  today.appendChild(await tx('Today · Tue, 17 Nov', 'Heading/18 SemiBold', 'text/primary', 'Title'));
  const box = cardBox(today, 'Doses', 16, 0); box.paddingTop = 0; box.paddingBottom = 0;
  const D = [
    { time: '8:30 AM', name: 'Metformin 500 mg', sub: '1 tablet after breakfast · Sunita', done: 'Taken at 8:34 AM' },
    { time: '2:00 PM', name: 'Vitamin D3 60,000 IU', sub: '1 sachet, weekly on Tuesdays · Aarav' },
    { time: '9:00 PM', name: 'Metformin 500 mg', sub: '1 tablet after dinner · Sunita' },
  ];
  for (let i = 0; i < D.length; i++) await doseRow(box, D[i], i === D.length - 1);
  const vac = block(c, 'Vaccines', 12);
  sectionHead(vac, 'Vaccines', 'See schedule');
  put(vac, variant('ComingUpCard', 'Kind=Vaccine'), true);
  const flu = cardBox(vac, 'Flu shot', 16, 4);
  const fr = auto('Row', 'HORIZONTAL'); fr.primaryAxisAlignItems = 'SPACE_BETWEEN'; fr.counterAxisAlignItems = 'CENTER'; put(flu, fr, true);
  fr.appendChild(await tx('Flu vaccine (yearly)', 'Subheading/16 SemiBold', 'text/primary', 'Name'));
  fr.appendChild(pill('Upcoming', 'Dec 2026'));
  flu.appendChild(await tx('Sunita · recommended every year for 65+', 'Caption/13 Regular', 'text/secondary', 'Detail'));
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 31. Add reminder ----
async function a5AddReminder(sec) {
  const f = newScreen(sec, 'Add reminder');
  topBar(f, 'New reminder', null);
  const c = content(f, 'Content', 8, 140, 20);
  const seg = variant('Segmented', 'Active=Left'); put(c, seg, true);
  setProps(seg, { Left: 'Medicine', Right: 'Vaccine' });
  await chipGroup(c, 'For', ['Aarav', 'Priya', 'Kabir', 'Sunita'], 3);
  input(c, 'Medicine name', 'Metformin 500 mg', 'Default', null);
  input(c, 'Dose', '1 tablet', 'Default', null);
  await chipGroup(c, 'When', ['Before breakfast', 'After breakfast', 'After lunch', 'After dinner', 'At bedtime'], [1, 3]);
  const tg = block(c, 'Times', 8);
  tg.appendChild(await tx('Remind me at', 'Body/14 Medium', 'text/primary', 'Label'));
  const tr = auto('Times', 'HORIZONTAL'); gapV(tr, 8); put(tg, tr, true);
  tr.appendChild(chip('8:30 AM', true)); tr.appendChild(chip('9:00 PM', true)); tr.appendChild(chip('+ Add time', false));
  const dg = block(c, 'Days', 8);
  dg.appendChild(await tx('Repeat', 'Body/14 Medium', 'text/primary', 'Label'));
  const days = auto('Days', 'HORIZONTAL'); days.primaryAxisAlignItems = 'SPACE_BETWEEN'; put(dg, days, true);
  for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    const b = circ('Day ' + d, 40, 'brand/primary');
    b.appendChild(await tx(d, 'Body/14 Medium', 'text/inverse', 'Label'));
    days.appendChild(b);
  }
  dg.appendChild(await tx('Every day', 'Caption/13 Regular', 'text/secondary', 'Summary'));
  const se = auto('Start and end', 'HORIZONTAL'); gapV(se, 12); put(c, se, true);
  input(se, 'Starts', '17 Nov 2026', 'Default', null);
  input(se, 'Ends', 'Ongoing', 'Default', null);
  const ref = cardBox(c, 'Refill', 16, 0); ref.paddingTop = 0; ref.paddingBottom = 0;
  await settingRow(ref, 'Remind me to refill', 'When about 5 tablets are left', true, true);
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Save reminder')]);
  addIndicator(f);
  return f;
}

// ---- 32. Link ABHA ----
async function a5LinkAbha(sec) {
  const f = newScreen(sec, 'Link ABHA');
  topBar(f, 'Link ABHA', null);
  const c = content(f, 'Content', 8, 160, 20);
  const hc = circ('Icon circle', 56, 'brand/primary-soft'); hc.appendChild(ic('ID Card', 'brand/primary', 28)); c.appendChild(hc);
  await heading(c, 'Link your ABHA', 'Your Ayushman Bharat Health Account lets you bring in records from hospitals and labs across India.');
  const seg = variant('Segmented', 'Active=Left'); put(c, seg, true);
  setProps(seg, { Left: 'ABHA number', Right: 'ABHA address' });
  input(c, 'ABHA number (14 digits)', '91-4523-7781-0034', 'Focused', 'Find it on your ABHA card or in the ABHA app.');
  const consent = auto('Consent', 'HORIZONTAL'); gapV(consent, 12); padV(consent, 14, 14, 14, 14);
  bindRadius(consent, 'button'); fillV(consent, 'brand/primary-soft');
  put(c, consent, true);
  consent.appendChild(checkbox(true));
  const ctt = await tx('I agree to share my name, gender, date of birth and mobile number with ABDM to verify my ABHA.', 'Body/14 Medium', 'text/primary', 'Text');
  consent.appendChild(ctt); fillW(ctt);
  const steps = cardBox(c, 'What happens next', 16, 12);
  steps.appendChild(await tx('What happens next', 'Subheading/16 SemiBold', 'text/primary', 'Title'));
  const S = ['We send an OTP to the mobile number linked to your ABHA.', 'You choose which records HealthHub can fetch, and for how long.', 'You can unlink any time from Privacy and data.'];
  for (let i = 0; i < S.length; i++) {
    const r = auto('Step ' + (i + 1), 'HORIZONTAL'); gapV(r, 12); put(steps, r, true);
    const n = circ('Number', 24, 'brand/primary'); n.appendChild(await tx(String(i + 1), 'Micro/12 Medium', 'text/inverse', 'N')); r.appendChild(n);
    const t = await tx(S[i], 'Body/14 Medium', 'text/primary', 'Text'); r.appendChild(t); fillW(t);
  }
  c.appendChild(btn('Ghost', 'M', 'Don\'t have an ABHA? Create one'));
  addStatusBar(f);
  footer(f, [btn('Primary', 'L', 'Send OTP')]);
  addIndicator(f);
  return f;
}

// ---- 33. Privacy and data ----
async function a5Privacy(sec) {
  const f = newScreen(sec, 'Privacy and data');
  topBar(f, 'Privacy and data', null);
  const c = content(f, 'Content', 8, 140, 20);
  const intro = await tx('You decide how your family\'s health data is used. Changes apply straight away.', 'Body/15 Regular', 'text/secondary', 'Intro');
  c.appendChild(intro); fillW(intro);
  const cg = block(c, 'Consents', 8);
  cg.appendChild(await tx('Your consents', 'Body/14 Medium', 'text/secondary', 'Group title'));
  const box = cardBox(cg, 'Card', 16, 0); box.paddingTop = 0; box.paddingBottom = 0;
  await settingRow(box, 'Store health records', 'Needed to keep records for your family. Given 17 Nov 2026.', true);
  await settingRow(box, 'Booking and dose reminders', 'SMS and notifications about bookings and medicines.', true);
  await settingRow(box, 'Help improve HealthHub', 'Share anonymised usage data. Never your records.', false);
  await settingRow(box, 'Offers and updates', 'Occasional messages about new features.', false, true);
  await noteBox(c, 'People', 'Kabir is under 18. His data is stored with your consent as his parent or guardian (17 Nov 2026).', T_NAVY);
  const dg = block(c, 'Your data', 8);
  dg.appendChild(await tx('Your data', 'Body/14 Medium', 'text/secondary', 'Group title'));
  const card = auto('Card', 'VERTICAL'); bindRadius(card, 'card'); strokeV(card, 'border/subtle', 1); fillV(card, 'surface/card'); card.clipsContent = true;
  put(dg, card, true);
  [['Download my data', 'Download', 'JSON + files'], ['App lock', 'Lock', 'Off'], ['Privacy policy', 'Document', null]].forEach(function (r, i, a) {
    const lr = HSET.ListRow.createInstance(); lr.name = 'ListRow / ' + r[0];
    put(card, lr, true);
    setProps(lr, { Label: r[0], 'Show value': !!r[2], Divider: i < a.length - 1, Icon: HI[r[1]].id });
    if (r[2]) setProps(lr, { Value: r[2] });
  });
  const del = block(c, 'Delete account', 8);
  const dc = auto('Card', 'VERTICAL'); bindRadius(dc, 'card'); strokeV(dc, 'border/subtle', 1); fillV(dc, 'surface/card'); dc.clipsContent = true;
  put(del, dc, true);
  const dl = HSET['ListRow Danger'].createInstance(); put(dc, dl, true);
  setProps(dl, { Label: 'Delete my account', Icon: HI.Trash.id });
  const dt = await tx('Permanently deletes your profile, family members, records and files. You\'ll type DELETE to confirm.', 'Caption/13 Regular', 'text/secondary', 'Warning');
  del.appendChild(dt); fillW(dt);
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 34. Help and FAQs ----
async function faq(parent, q, a, last) {
  const g = auto(q, 'VERTICAL'); put(parent, g, true);
  const r = auto('Question', 'HORIZONTAL'); r.counterAxisAlignItems = 'CENTER'; gapV(r, 12); padV(r, 14, 0, 14, 0); put(g, r, true);
  const t = await tx(q, 'Body/15 Regular', 'text/primary', 'Question'); r.appendChild(t); fillW(t);
  r.appendChild(ic(a ? 'Chevron Down' : 'Chevron Right', 'text/secondary', 20));
  if (a) { const at = await tx(a, 'Body/14 Medium', 'text/secondary', 'Answer'); g.appendChild(at); fillW(at); g.paddingBottom = 14; }
  if (!last) divider(parent);
}
async function a5Help(sec) {
  const f = newScreen(sec, 'Help and FAQs');
  topBar(f, 'Help and support', null);
  const c = content(f, 'Content', 8, 140, 20);
  const sb = HSET.SearchBar.createInstance(); put(c, sb, true);
  setProps(sb, { Placeholder: 'Search help articles' });
  const ct = auto('Contact', 'HORIZONTAL'); gapV(ct, 12); put(c, ct, true);
  for (const k of [['Help', 'Chat with us', 'Replies in about 5 min'], ['Phone', 'Call us', 'Mon–Sat, 9 AM–8 PM']]) {
    const t = auto(k[1], 'VERTICAL'); gapV(t, 8); padV(t, 16, 16, 16, 16); cardStyle(t); put(ct, t, true);
    const cir = circ('Icon circle', 40, 'brand/primary-soft'); cir.appendChild(ic(k[0], 'brand/primary', 20)); t.appendChild(cir);
    t.appendChild(await tx(k[1], 'Subheading/16 SemiBold', 'text/primary', 'Title'));
    const s = await tx(k[2], 'Caption/13 Regular', 'text/secondary', 'Sub'); t.appendChild(s); fillW(s);
  }
  const fq = block(c, 'FAQs', 8);
  fq.appendChild(await tx('Common questions', 'Heading/18 SemiBold', 'text/primary', 'Title'));
  const box = cardBox(fq, 'List', 16, 0); box.paddingTop = 0; box.paddingBottom = 0;
  const Q = [
    ['How do I add a family member?', 'Go to Profile → Family members → Add member. For a child under 18 you\'ll confirm you\'re the parent or guardian.'],
    ['Is my family\'s health data safe?'], ['How do refunds work?'], ['Can I share a report with my doctor?'],
    ['What is ABHA, and do I need it?'], ['How does home sample collection work?'],
  ];
  for (let i = 0; i < Q.length; i++) await faq(box, Q[i][0], Q[i][1], i === Q.length - 1);
  addStatusBar(f);
  addIndicator(f);
  return f;
}

// ---- 35. Offline ----
async function a5Offline(sec) {
  const f = newScreen(sec, 'Offline');
  const banner = auto('Offline banner', 'HORIZONTAL'); gapV(banner, 8); padV(banner, 10, 20, 10, 20); banner.counterAxisAlignItems = 'CENTER';
  fillV(banner, 'status/warning-soft');
  put(f, banner, true);
  banner.appendChild(ic('Wifi Off', 'status/warning-text', 18));
  const bt = await tx('No internet connection', 'Body/14 Medium', 'status/warning-text', 'Text'); banner.appendChild(bt); fillW(bt);
  const body = emptyBody(f);
  const es = HSET.EmptyState.createInstance(); es.name = 'EmptyState / Offline';
  body.appendChild(es);
  setProps(es, { Title: 'You\'re offline', Message: 'Check your Wi-Fi or mobile data. Records you\'ve opened before are still available.', Icon: HI['Wifi Off'].id, 'Show badge': false });
  setProps(exposed(es, 'Button / Upload a record'), { Label: 'Try again', Icon: HI.Refresh.id });
  body.appendChild(btn('Ghost', 'M', 'View saved records'));
  addStatusBar(f);
  addChrome(f, 'Home');
  return f;
}

// ---- 36. Error ----
async function a5Error(sec) {
  const f = newScreen(sec, 'Error');
  const h = content(f, 'Header', 8, 0, 0);
  await tabHeader(h, 'Records', null);
  const body = emptyBody(f);
  const es = HSET.EmptyState.createInstance(); es.name = 'EmptyState / Error';
  body.appendChild(es);
  setProps(es, { Title: 'We couldn\'t load your records', Message: 'This is a problem on our side, not yours. Your records are safe. Please try again in a moment.', Icon: HI.Warning.id, 'Show badge': false });
  setProps(exposed(es, 'Button / Upload a record'), { Label: 'Try again', Icon: HI.Refresh.id });
  const code = await tx('Error HH-503 · Contact support if this keeps happening', 'Caption/13 Regular', 'text/secondary', 'Error code');
  body.appendChild(code);
  addStatusBar(f);
  addChrome(f, 'Records');
  return f;
}

// ---- 37. Home loading skeleton ----
async function a5Skeleton(sec) {
  const f = newScreen(sec, 'Home loading');
  const c = content(f, 'Content', 8, 136, 24);
  const g = auto('Greeting', 'HORIZONTAL'); g.primaryAxisAlignItems = 'SPACE_BETWEEN'; g.counterAxisAlignItems = 'CENTER'; put(c, g, true);
  const gt = auto('Text', 'VERTICAL'); gapV(gt, 10); g.appendChild(gt);
  bone(gt, 220, 24); bone(gt, 260, 14);
  bone(g, 44, 44, 22);
  const m = auto('Members', 'HORIZONTAL'); gapV(m, 12); c.appendChild(m);
  for (let i = 0; i < 5; i++) { const col = auto('Member', 'VERTICAL'); gapV(col, 8); col.counterAxisAlignItems = 'CENTER'; m.appendChild(col); bone(col, 56, 56, 28); bone(col, 40, 10); }
  bone(c, 353, 52, 26, true);
  for (let r = 0; r < 2; r++) {
    const row = auto('Tiles', 'HORIZONTAL'); row.primaryAxisAlignItems = 'SPACE_BETWEEN'; put(c, row, true);
    for (let i = 0; i < 4; i++) { const col = auto('Tile', 'VERTICAL'); gapV(col, 8); col.counterAxisAlignItems = 'CENTER'; row.appendChild(col); bone(col, 80, 72, 16); bone(col, 56, 10); }
  }
  bone(c, 160, 18);
  for (let i = 0; i < 2; i++) {
    const card = auto('Card', 'VERTICAL'); gapV(card, 12); padV(card, 16, 16, 16, 16); cardStyle(card); put(c, card, true);
    const top = auto('Top', 'HORIZONTAL'); gapV(top, 12); card.appendChild(top);
    bone(top, 44, 44, 22);
    const tc = auto('Text', 'VERTICAL'); gapV(tc, 8); top.appendChild(tc); bone(tc, 180, 14); bone(tc, 220, 10);
    bone(card, 321, 40, 12, true);
  }
  f.setPluginData('annotation', 'Skeleton: shows on first load only (pull-to-refresh keeps the old content). A soft shimmer sweeps left to right every 1.2 s; with reduced motion the blocks stay static. Replace with content as soon as data arrives.');
  addStatusBar(f);
  addChrome(f, 'Home');
  return f;
}

async function runA5c() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found. Run A4 first.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();
  await loadA3(page);
  const addedIcons = await ensureIcons(page);
  const patched = patchComponents();
  STATUS_TEMPLATE = findStatusBar(home);

  const NAME = 'HealthHub / A5c screens';
  const old = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === NAME; })[0];
  let pos;
  if (old) { pos = { x: old.x, y: old.y }; old.remove(); }
  else {
    const b = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / A5b screens'; })[0];
    if (!b) throw new Error('Run A5b first (its section sets where A5c goes).');
    pos = { x: b.x, y: Math.round(b.y + b.height + 400) };
  }
  const sec = figma.createSection();
  sec.name = NAME;
  page.appendChild(sec);
  sec.x = pos.x; sec.y = pos.y;

  const frames = [];
  try {
    const details = await a5ApptDetails(sec);
    frames.push(details);
    frames.push(await a5Reschedule(sec));
    frames.push(await a5CancelSheet(sec, details));
    frames.push(await a5Reminders(sec));
    frames.push(await a5AddReminder(sec));
    frames.push(await a5LinkAbha(sec));
    frames.push(await a5Privacy(sec));
    frames.push(await a5Help(sec));
    frames.push(await a5Offline(sec));
    frames.push(await a5Error(sec));
    frames.push(await a5Skeleton(sec));
  } catch (e) {
    sec.remove();
    throw e;
  }

  const bg = [];
  for (const f of frames) bg.push(await fixBg(f));
  frames.forEach(function (f, i) { f.x = 40 + (i % 6) * (SW + 80); f.y = 80 + Math.floor(i / 6) * (SH + 160); });
  sec.resizeWithoutConstraints(40 + 6 * (SW + 80), 80 + 2 * (SH + 160) + 40);
  for (const f of frames) {
    const note = f.getPluginData('annotation');
    if (!note) continue;
    const t = await tx(note, 'Caption/13 Regular', 'text/secondary', 'Note / ' + f.name.replace('HealthHub / ', ''));
    sec.appendChild(t);
    t.textAutoResize = 'HEIGHT'; t.resize(SW, t.height);
    t.x = f.x; t.y = f.y + SH + 16;
  }
  figma.currentPage.selection = [sec];
  figma.viewport.scrollAndZoomIntoView([sec]);

  const ex = await exportScreens(page, frames, 'a5c-');
  NOTES5.forEach(function (n) { console.log('[A5c] ' + n); });
  await upload('a5c-screens', {
    generatedAt: new Date().toISOString(), notes: NOTES5, addedIcons: addedIcons, patched: patched, background: bg, contentHeights: ex.heights,
    section: { id: sec.id, x: sec.x, y: sec.y }, frames: frames.map(function (f) { return { id: f.id, name: f.name }; }),
  }, ex.pngs);
  const bad = bg.filter(function (d) { return !d.ok; }).length;
  return (bad ? '⚠ ' : '✓ ') + 'A5c: ' + frames.length + ' new screens in "' + NAME + '"' + (bad ? '; ' + bad + ' background(s) still dark' : '') + '.';
}

// =====================================================================
// A6 · Prototype wiring + QA report
// =====================================================================

const SCREEN_SECTIONS = ['HealthHub / Screens', 'HealthHub / A5a screens', 'HealthHub / A5b screens', 'HealthHub / A5c screens'];
async function collectAll(page) {
  const S = {};
  for (const name of SCREEN_SECTIONS) {
    const sec = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === name; })[0];
    if (!sec) throw new Error('Section "' + name + '" not found. Run A4–A5c first.');
    sec.children.forEach(function (n) { if (n.type === 'FRAME' && n.name.indexOf('HealthHub / ') === 0) S[n.name.slice('HealthHub / '.length)] = n; });
  }
  return S;
}
function one(frame, name) { return frame ? frame.findOne(function (n) { return n.name === name; }) : null; }
function prefixed(frame, prefix) { return frame ? frame.findAll(function (n) { return n.name.indexOf(prefix) === 0; }) : []; }
async function instancesOf(frame, setName, variantName) {
  const out = [];
  if (!frame) return out;
  for (const n of frame.findAll(function (x) { return x.type === 'INSTANCE'; })) {
    const m = await n.getMainComponentAsync();
    if (!m) continue;
    const setOk = m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name === setName : m.name === setName;
    if (setOk && (!variantName || m.name === variantName)) out.push(n);
  }
  return out;
}
function topBack(frame) {
  const tb = one(frame, 'TopBar');
  return tb ? tb.findOne(function (n) { return n.name === 'Back'; }) : one(frame, 'Back');
}
function topAction(frame) { const tb = one(frame, 'TopBar'); return tb ? tb.findOne(function (n) { return n.name === 'Action'; }) : null; }

const TRANS = { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 0.3 };
const WIRE = { ok: 0, missing: [] };
async function react(node, label, trigger, action) {
  if (!node) { WIRE.missing.push(label + ' (layer not found)'); return; }
  try { await node.setReactionsAsync([{ trigger: trigger, actions: [action] }]); WIRE.ok++; }
  catch (e) { WIRE.missing.push(label + ': ' + (e && e.message ? e.message : e)); }
}
function go(node, dest, label) {
  if (!dest) { WIRE.missing.push(label + ' (destination screen missing)'); return Promise.resolve(); }
  return react(node, label, { type: 'ON_CLICK' }, { type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition: TRANS, resetVideoPosition: false });
}
function back(node, label) { return react(node, label, { type: 'ON_CLICK' }, { type: 'BACK' }); }
function after(frame, dest, seconds, label) {
  return react(frame, label, { type: 'AFTER_TIMEOUT', timeout: seconds },
    { type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE', transition: { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.4 }, resetVideoPosition: false });
}

async function wirePrototype(S, page) {
  const W = function (screen, layer, dest) { return go(one(S[screen], layer), S[dest], screen + ' › ' + layer + ' → ' + dest); };
  const ALL = async function (screen, nodes, dest, what) {
    if (!nodes.length) WIRE.missing.push(screen + ' › ' + what + ' (none found)');
    for (const n of nodes) await go(n, S[dest], screen + ' › ' + n.name + ' → ' + dest);
  };
  const BACK = function (screen) { return back(topBack(S[screen]), screen + ' › Back'); };
  const ES_BTN = function (screen) { const es = one(S[screen], 'Button / Upload a record'); return es; };

  // first launch
  await after(S['Splash'], S['Onboarding 1'], 2, 'Splash → Onboarding 1 (after 2 s)');
  await W('Onboarding 1', 'Button / Next', 'Onboarding 2'); await W('Onboarding 1', 'Button / Skip', 'Sign in');
  await W('Onboarding 2', 'Button / Next', 'Onboarding 3'); await W('Onboarding 2', 'Button / Skip', 'Sign in');
  await W('Onboarding 3', 'Button / Get started', 'Sign in');
  await W('Sign in', 'Button / Send code', 'Verify OTP');
  await BACK('Verify OTP'); await W('Verify OTP', 'Button / Verify', 'Create profile');
  await BACK('Create profile'); await W('Create profile', 'Button / Continue', 'Add first family member');
  await BACK('Add first family member');
  await W('Add first family member', 'Button / Add member', 'Home'); await W('Add first family member', 'Button / Skip for now', 'Home');
  await after(S['Home loading'], S['Home'], 1.5, 'Home loading → Home (after 1.5 s)');

  // Home
  await W('Home', 'SearchBar', 'Search results');
  await W('Home', 'Notifications (1 unread)', 'Notifications');
  const sw = one(S['Home'], 'MemberSwitcher (Kabir selected)');
  await go(sw ? sw.findOne(function (n) { return n.name === 'Member / Kabir'; }) : null, S['Member details'], 'Home › Member / Kabir → Member details');
  await go(sw ? sw.findOne(function (n) { return n.name === 'Add member'; }) : null, S['Edit member'], 'Home › Add member → Edit member');
  for (const q of [['Consult', 'Specialties'], ['Lab tests', 'Lab packages'], ['Vaccines', 'Reminders'], ['Medicines', 'Reminders'], ['Upload record', 'Upload record'], ['Reminders', 'Reminders']]) {
    await W('Home', 'QuickAction / ' + q[0], q[1]);
  }
  await ALL('Home', await instancesOf(S['Home'], 'ComingUpCard', 'Kind=Appointment'), 'Appointment details', 'Coming up appointment');
  await ALL('Home', await instancesOf(S['Home'], 'ComingUpCard', 'Kind=Vaccine'), 'Reminders', 'Coming up vaccine');
  await ALL('Home', await instancesOf(S['Home'], 'RecordCard'), 'Record details', 'record cards');
  await ALL('Home', prefixed(S['Home'], 'LabPackageCard / '), 'Package details', 'lab package cards');
  await W('Home', 'Promo / Lab reports', 'Lab packages');
  for (const s of [['SectionHeader / Coming up for Kabir', 'Bookings'], ['SectionHeader / Kabir\'s records', 'Records'], ['SectionHeader / Popular lab packages', 'Lab packages']]) {
    const h = one(S['Home'], s[0]);
    await go(h ? h.findOne(function (n) { return n.name === 'Link'; }) : null, S[s[1]], 'Home › ' + s[0] + ' See all → ' + s[1]);
  }

  // Records
  await ALL('Records', await instancesOf(S['Records'], 'RecordCard'), 'Record details', 'record cards');
  await W('Records', 'Upload (floating)', 'Upload record');
  await W('Records', 'Search', 'Search results');
  await go(ES_BTN('Records / Empty'), S['Upload record'], 'Records / Empty › Upload a record → Upload record');
  await BACK('Upload record'); await W('Upload record', 'Button / Save record', 'Record details');
  await BACK('Record details');

  // Bookings + appointment
  await ALL('Bookings', await instancesOf(S['Bookings'], 'AppointmentCard'), 'Appointment details', 'appointment cards');
  await W('Bookings', 'LabBookingCard', 'Lab booking confirmed');
  await go(ES_BTN('Bookings / Empty'), S['Specialties'], 'Bookings / Empty › Book a doctor → Specialties');
  await BACK('Appointment details');
  await W('Appointment details', 'Button / Reschedule', 'Reschedule');
  await W('Appointment details', 'Button / Cancel', 'Cancel appointment');
  await BACK('Reschedule'); await W('Reschedule', 'Button / Confirm new time', 'Appointment details');
  const sheet = one(S['Cancel appointment'], 'Bottom sheet');
  await back(sheet ? sheet.findOne(function (n) { return n.name === 'Button / Keep it'; }) : null, 'Cancel appointment › Keep it → back');
  await go(sheet ? sheet.findOne(function (n) { return n.name === 'Button / Yes, cancel'; }) : null, S['Bookings'], 'Cancel appointment › Yes, cancel → Bookings');
  await back(one(S['Cancel appointment'], 'Scrim'), 'Cancel appointment › Scrim → back');

  // Doctor booking
  await BACK('Specialties');
  await ALL('Specialties', prefixed(S['Specialties'], 'Specialty / '), 'Doctor list', 'specialty tiles');
  await BACK('Doctor list');
  await ALL('Doctor list', prefixed(S['Doctor list'], 'DoctorCard / '), 'Doctor profile', 'doctor cards');
  await BACK('Doctor profile'); await W('Doctor profile', 'Button / Book appointment', 'Choose a time');
  await BACK('Choose a time'); await W('Choose a time', 'Button / Continue', 'Review and pay');
  await BACK('Review and pay'); await W('Review and pay', 'Button / Pay ₹600', 'Booking confirmed');
  await W('Booking confirmed', 'Button / View booking', 'Appointment details'); await W('Booking confirmed', 'Button / Back to home', 'Home');

  // Lab booking
  await BACK('Lab packages');
  await ALL('Lab packages', prefixed(S['Lab packages'], 'LabPackageCard / '), 'Package details', 'package cards');
  await BACK('Package details'); await W('Package details', 'Button / Select members', 'Members and address');
  await BACK('Members and address'); await W('Members and address', 'Button / Pick a time', 'Lab collection time');
  await BACK('Lab collection time'); await W('Lab collection time', 'Button / Review booking', 'Lab booking confirmed');
  await W('Lab booking confirmed', 'Button / View booking', 'Bookings'); await W('Lab booking confirmed', 'Button / Back to home', 'Home');
  await BACK('Report ready'); await W('Report ready', 'Button / Book a follow-up with a doctor', 'Specialties');

  // Search + notifications
  await back(one(S['Search results'], 'Back'), 'Search results › Back');
  await ALL('Search results', prefixed(S['Search results'], 'LabPackageCard / '), 'Package details', 'lab card');
  await ALL('Search results', prefixed(S['Search results'], 'DoctorCard / '), 'Doctor profile', 'doctor card');
  await ALL('Search results', await instancesOf(S['Search results'], 'RecordCard'), 'Record details', 'record card');
  await BACK('Notifications');
  await W('Notifications', 'Report ready', 'Report ready');
  await W('Notifications', 'Vaccine due in 3 days', 'Reminders');
  await W('Notifications', 'Appointment confirmed', 'Appointment details');

  // Family + profile
  await BACK('Family');
  await ALL('Family', prefixed(S['Family'], 'Member / '), 'Member details', 'member cards');
  await W('Family', 'Add family member', 'Edit member');
  await go(topAction(S['Family']), S['Edit member'], 'Family › + → Edit member');
  await BACK('Member details');
  await go(topAction(S['Member details']), S['Edit member'], 'Member details › Edit → Edit member');
  for (const r of [['Records', 'Records'], ['Bookings', 'Bookings'], ['Reminders', 'Reminders']]) await W('Member details', 'ListRow / ' + r[0], r[1]);
  await BACK('Edit member'); await W('Edit member', 'Button / Save changes', 'Member details');
  for (const r of [['Family members', 'Family'], ['Link ABHA', 'Link ABHA'], ['Reminders', 'Reminders'], ['Notifications', 'Notifications'],
    ['Privacy and data', 'Privacy and data'], ['Help and support', 'Help and FAQs'], ['Replay app tips', 'Onboarding 1']]) {
    await W('Profile', 'ListRow / ' + r[0], r[1]);
  }
  await W('Profile', 'Edit profile', 'Create profile');
  await ALL('Profile', await instancesOf(S['Profile'], 'ListRow Danger'), 'Sign in', 'Log out');
  await BACK('Reminders'); await go(topAction(S['Reminders']), S['Add reminder'], 'Reminders › + → Add reminder');
  await BACK('Add reminder'); await W('Add reminder', 'Button / Save reminder', 'Reminders');
  await BACK('Link ABHA'); await BACK('Privacy and data'); await BACK('Help and FAQs');

  // states
  await go(ES_BTN('Offline'), S['Home'], 'Offline › Try again → Home');
  await W('Offline', 'Button / View saved records', 'Records');
  await go(ES_BTN('Error'), S['Records'], 'Error › Try again → Records');

  // bottom tabs on every screen that has the NavBar
  const TABS = { Home: 'Home', Records: 'Records', Bookings: 'Bookings', Profile: 'Profile' };
  for (const k of Object.keys(S)) {
    const nav = one(S[k], 'NavBar');
    if (!nav) continue;
    for (const t of Object.keys(TABS)) {
      if (TABS[t] === k) continue; // a frame can't link to itself
      await go(nav.findOne(function (n) { return n.name === 'Tab / ' + t; }), S[TABS[t]], k + ' › NavBar ' + t);
    }
  }

  try {
    const keep = (page.flowStartingPoints || []).filter(function (f) {
      return [S['Splash'], S['Home'], S['Specialties'], S['Lab packages']].every(function (s) { return f.nodeId !== s.id; });
    });
    page.flowStartingPoints = [
      { nodeId: S['Splash'].id, name: 'HealthHub · First launch' },
      { nodeId: S['Home'].id, name: 'HealthHub · Signed in' },
      { nodeId: S['Specialties'].id, name: 'HealthHub · Book a doctor' },
      { nodeId: S['Lab packages'].id, name: 'HealthHub · Book a lab test' },
    ].concat(keep);
  } catch (e) { WIRE.missing.push('Flow starting points: ' + e.message); }
}

// ----- QA -----
const VAR_CACHE = {};
async function paintColor(p, node) {
  if (p.boundVariables && p.boundVariables.color) {
    const id = p.boundVariables.color.id;
    const v = VAR_CACHE[id] || (VAR_CACHE[id] = await figma.variables.getVariableByIdAsync(id));
    try { const r = v.resolveForConsumer(node).value; if (r && r.r !== undefined) return r; } catch (e) { /* fall through */ }
  }
  return p.color;
}
// effective solid background behind a node, or null when it sits on a gradient / image
async function bgOf(node, root) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'PAGE' || p.type === 'SECTION') return { r: 1, g: 1, b: 1 };
    if (!('fills' in p) || !Array.isArray(p.fills)) continue;
    const vis = p.fills.filter(function (f) { return f.visible !== false; });
    if (!vis.length) { if (p === root) return { r: 1, g: 1, b: 1 }; continue; }
    if (vis.some(function (f) { return f.type !== 'SOLID'; })) return null;
    const top = vis[vis.length - 1];
    const col = await paintColor(top, p);
    const a = (top.opacity === undefined ? 1 : top.opacity);
    if (a >= 0.99) return col;
    const under = await bgOf(p, root);
    return under ? blend(col, a, under) : null;
  }
  return { r: 1, g: 1, b: 1 };
}
function dimmed(n, root) { for (let p = n; p && p !== root; p = p.parent) if ('opacity' in p && p.opacity < 0.99) return true; return false; }
function inside(n, root, name) { for (let p = n.parent; p && p !== root; p = p.parent) if (p.name === name) return true; return false; }
function where(n, root) {
  const path = [];
  for (let p = n; p && p !== root; p = p.parent) path.unshift(p.name);
  return root.name.replace('HealthHub / ', '') + ' › ' + path.slice(-3).join(' › ');
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

async function runQA(S) {
  const R = { small: [], smallFixed: [], contrast: [], exempt: 0, touch: [], hardcoded: [], rebound: 0, detached: [], noAuto: [], data: [], textsChecked: 0 };
  const compNames = Object.keys(HSET);
  const INTENTIONAL = ['Illustration', 'Map preview', 'Preview (tap to zoom)', 'Prescription page', 'Notifications (1 unread)'];
  const palette = HH_COLORS.map(function (c) { return { name: c[0], c: rgb(c[1]) }; });
  function nearest(col) {
    let best = null, d0 = 1;
    palette.forEach(function (p) { const d = Math.max(Math.abs(p.c.r - col.r), Math.abs(p.c.g - col.g), Math.abs(p.c.b - col.b)); if (d < d0) { d0 = d; best = p.name; } });
    return d0 <= 0.02 ? best : null;
  }
  const seenData = {};
  function dataIssue(msg) { if (!seenData[msg]) { seenData[msg] = 1; R.data.push(msg); } }

  for (const key of Object.keys(S)) {
    const root = S[key];
    const all = root.findAll(function () { return true; });
    const own = all.filter(function (n) { for (let p = n.parent; p && p !== root; p = p.parent) if (p.type === 'INSTANCE') return false; return true; });
    const ownSet = new Set(own);
    for (const n of all) {
      if (n.type === 'TEXT' && n.visible) {
        if (/status bar/i.test(where(n, root)) || inside(n, root, 'iPhone Status bar')) continue;
        // the Cancel screen is a dimmed copy of Appointment details: only the sheet is "live"
        if (key === 'Cancel appointment' && !inside(n, root, 'Bottom sheet')) continue;
        R.textsChecked++;
        const segs = n.getStyledTextSegments(['fontSize', 'fills', 'fontWeight']);
        for (const s of segs) {
          if (s.fontSize < 12) {
            if (ownSet.has(n)) { await figma.loadFontAsync(n.getRangeFontName(s.start, s.end)); n.setRangeFontSize(s.start, s.end, 12); R.smallFixed.push(where(n, root) + ' (' + s.fontSize + ' → 12px)'); }
            else R.small.push(where(n, root) + ' ' + s.fontSize + 'px');
          }
          const fp = (s.fills || []).filter(function (f) { return f.visible !== false && f.type === 'SOLID'; }).pop();
          if (!fp) continue;
          if (dimmed(n, root)) { R.exempt++; continue; } // disabled slots, disabled member row (WCAG exempts inactive controls)
          const bg = await bgOf(n, root);
          if (!bg) continue;
          const fgC = await paintColor(fp, n);
          const a = fp.opacity === undefined ? 1 : fp.opacity;
          const fg = a < 1 ? blend(fgC, a, bg) : fgC;
          const ratio = contrast(fg, bg);
          const large = s.fontSize >= 24 || (s.fontSize >= 18.66 && s.fontWeight >= 600);
          if (ratio < (large ? 3 : 4.5)) R.contrast.push(where(n, root) + ' "' + n.characters.slice(s.start, Math.min(s.end, s.start + 28)) + '" ' + toHex(fg) + ' on ' + toHex(bg) + ' = ' + ratio.toFixed(2) + ':1');
        }
        const t = n.characters;
        // weekday ↔ date (Nov/Dec 2026 unless a year is given)
        const re = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?: (\d{4}))?/g;
        let m;
        while ((m = re.exec(t))) {
          const y = m[4] ? Number(m[4]) : 2026;
          const real = DOW[new Date(Date.UTC(y, MON[m[3]], Number(m[2]))).getUTCDay()];
          if (real !== m[1]) dataIssue(where(n, root) + ': "' + m[0] + '" is a ' + real);
        }
        if (/[\uD83C-\uD83E][\uDC00-\uDFFF]/.test(t)) dataIssue(where(n, root) + ': emoji in "' + t.slice(0, 40) + '"');
        if (/\S {2,}\S/.test(t) && n.name !== 'Test') dataIssue(where(n, root) + ': double space in "' + t.slice(0, 40) + '"');
        if (/\b(Jake|Julie|Joseph|Carper)\b/.test(t)) dataIssue(where(n, root) + ': old placeholder name in "' + t.slice(0, 40) + '"');
      }
      // touch targets for everything wired
      if (n !== root && 'reactions' in n && n.reactions && n.reactions.length && (n.width < 44 || n.height < 44)) {
        R.touch.push(where(n, root) + ' ' + Math.round(n.width) + '×' + Math.round(n.height));
      }
    }
    // price / MRP / discount must agree on every lab package card
    for (const card of await instancesOf(root, 'LabPackageCard')) {
      const val = function (name) { const x = card.findOne(function (n) { return n.type === 'TEXT' && n.name === name; }); return x ? x.characters : ''; };
      const num = function (s) { return Number(s.replace(/[^\d]/g, '')); };
      const price = num(val('Price value')), mrp = num(val('MRP')), off = num(val('Discount'));
      if (price && mrp && Math.round((1 - price / mrp) * 100) !== off) dataIssue(where(card, root) + ': ' + val('Price value') + ' of ' + val('MRP') + ' is ' + Math.round((1 - price / mrp) * 100) + '% off, not ' + val('Discount'));
      const mrpNode = card.findOne(function (n) { return n.type === 'TEXT' && n.name === 'MRP'; });
      if (mrpNode && mrpNode.textDecoration !== 'STRIKETHROUGH') dataIssue(where(card, root) + ': MRP not struck through');
    }
    for (const n of own) {
      if (n === root) continue; // screen frames keep a plain fill on purpose (bound fills render black there)
      for (const prop of ['fills', 'strokes']) {
        if (!(prop in n) || !Array.isArray(n[prop])) continue;
        let changed = false;
        const out = n[prop].map(function (p) {
          if (p.type !== 'SOLID' || (p.boundVariables && p.boundVariables.color)) return p;
          const v = nearest(p.color);
          if (v) { changed = true; R.rebound++; return figma.variables.setBoundVariableForPaint(Object.assign({}, p), 'color', HV[v]); }
          R.hardcoded.push(where(n, root) + ' ' + prop + ' ' + toHex(p.color));
          return p;
        });
        if (changed) n[prop] = out;
      }
      if (n.type === 'FRAME' && (compNames.indexOf(n.name) >= 0 || /^(Style|State|Active|Status|Kind|Type)=/.test(n.name))) R.detached.push(where(n, root));
      if (n.type === 'FRAME' && n.layoutMode === 'NONE' && n.children.length && INTENTIONAL.indexOf(n.name) < 0) R.noAuto.push(where(n, root));
      if (n.type === 'GROUP') R.noAuto.push(where(n, root) + ' (group)');
    }
    if (root.layoutMode === 'NONE') R.noAuto.push(root.name + ' (screen frame)');
  }
  return R;
}

function a6ReportText(R, nScreens) {
  const L = [];
  function sec(title, items, okMsg, max) {
    L.push(''); L.push(title + ' (' + items.length + ')');
    if (!items.length) { L.push('  ✓ ' + okMsg); return; }
    items.slice(0, max || 30).forEach(function (i) { L.push('  • ' + i); });
    if (items.length > (max || 30)) L.push('  … and ' + (items.length - (max || 30)) + ' more (see console)');
  }
  L.push('HEALTHHUB — QA REPORT · ' + new Date().toISOString().slice(0, 10));
  L.push(nScreens + ' screens. Prototype: ' + WIRE.ok + ' interactions. Flows: First launch (Splash), Signed in (Home), Book a doctor, Book a lab test.');
  sec('Prototype links that could not be wired', WIRE.missing, 'all wired');
  sec('FIXED — text raised to 12px', R.smallFixed, 'nothing under 12px');
  sec('Text under 12px inside components', R.small, 'none');
  L.push(''); L.push('Contrast: ' + R.textsChecked + ' text layers checked against their real resolved colours; ' + R.exempt + ' disabled/dimmed layers exempt (WCAG).');
  sec('Contrast under 4.5:1 (3:1 for large text)', R.contrast, 'every text passes AA');
  sec('Touch targets under 44px (wired layers)', R.touch, 'all wired layers are at least 44×44');
  L.push(''); L.push('FIXED — hard-coded colours bound to tokens: ' + R.rebound);
  sec('Hard-coded colours with no matching token', R.hardcoded, 'none (screen backgrounds are plain #F6F7FB / #2E4482 on purpose)');
  sec('Detached instances', R.detached, 'none');
  sec('Frames / groups without auto layout', R.noAuto, 'none (illustrations, map, record preview and the bell + dot are free-positioned on purpose)');
  sec('Inconsistent data', R.data, 'weekdays match the 2026 calendar, prices match discounts, MRPs struck through, no emoji or old names');
  L.push('');
  L.push('Known gaps (not designed yet): ABHA OTP step after "Send OTP"; lab "Review booking" goes straight to confirmed; Share / PDF are not wired.');
  L.push('Check by eye: 3D tile art, onboarding illustrations, shadows on floating cards.');
  return L.join('\n');
}

async function runA6() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  await loadHH();
  await loadA3(page);
  const S = await collectAll(page);

  // pending copy fix from the A5c review
  const fixes = [];
  const sheet = one(S['Cancel appointment'], 'Bottom sheet');
  const old = sheet ? sheet.findOne(function (n) { return n.name === 'Button / Cancel appointment'; }) : null;
  if (old) { setProps(old, { Label: 'Yes, cancel' }); old.name = 'Button / Yes, cancel'; fixes.push('Cancel sheet button: "Cancel appointment" → "Yes, cancel"'); }
  // "See all" links were 43px wide: give the SectionHeader link side padding (instances follow)
  const link = HSET.SectionHeader.findOne(function (n) { return n.name === 'Link'; });
  if (link && link.width < 44) { link.paddingLeft = 8; link.paddingRight = 8; fixes.push('SectionHeader "See all" link widened to ≥ 44px'); }
  // MRP strikethrough is lost on cards whose MRP text was overridden: re-apply on every instance
  let struck = 0;
  for (const k of Object.keys(S)) {
    for (const card of await instancesOf(S[k], 'LabPackageCard')) {
      const mrp = card.findOne(function (n) { return n.type === 'TEXT' && n.name === 'MRP'; });
      if (mrp && mrp.textDecoration !== 'STRIKETHROUGH') { mrp.textDecoration = 'STRIKETHROUGH'; struck++; }
    }
  }
  if (struck) fixes.push('MRP struck through on ' + struck + ' lab card(s)');

  await wirePrototype(S, page);
  const R = await runQA(S);
  const text = a6ReportText(R, Object.keys(S).length);
  console.log(text);
  [['contrast', R.contrast], ['touch', R.touch], ['hardcoded', R.hardcoded], ['noAuto', R.noAuto], ['wire', WIRE.missing], ['data', R.data]].forEach(function (x) {
    if (x[1].length > 30) console.log('[A6 ' + x[0] + ' full list]\n' + x[1].join('\n'));
  });

  // report frame under the A5c section (replaces an earlier one)
  const prev = page.children.filter(function (n) { return n.name === 'HealthHub / QA report'; })[0];
  if (prev) prev.remove();
  const anchor = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / A5c screens'; })[0];
  const box = auto('HealthHub / QA report', 'VERTICAL');
  padV(box, 32, 32, 32, 32); bindRadius(box, 'card'); fillV(box, 'surface/card'); strokeV(box, 'border/subtle', 1);
  page.appendChild(box);
  box.x = anchor ? anchor.x : 0; box.y = anchor ? anchor.y + anchor.height + 300 : 0;
  const t = await tx(text, 'Body/14 Medium', 'text/primary', 'Report');
  box.appendChild(t); t.textAutoResize = 'HEIGHT'; t.resize(960, t.height);
  figma.currentPage.selection = [box];
  figma.viewport.scrollAndZoomIntoView([box]);

  const png = await box.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
  await upload('a6-qa', {
    generatedAt: new Date().toISOString(), screens: Object.keys(S), fixes: fixes, wired: WIRE.ok, wireMissing: WIRE.missing,
    smallFixed: R.smallFixed, small: R.small, contrast: R.contrast, exempt: R.exempt, textsChecked: R.textsChecked, touch: R.touch,
    rebound: R.rebound, hardcoded: R.hardcoded, detached: R.detached, noAuto: R.noAuto, data: R.data,
  }, [{ slug: 'a6-qa-report', bytes: png }]);
  const issues = WIRE.missing.length + R.small.length + R.contrast.length + R.touch.length + R.hardcoded.length + R.detached.length + R.noAuto.length + R.data.length;
  return (issues ? '⚠ ' : '✓ ') + 'A6: ' + WIRE.ok + ' prototype links, ' + (R.smallFixed.length + R.rebound + fixes.length) + ' auto-fixes, ' + issues + ' open item(s). QA report selected.';
}

// =====================================================================
// Export tile art — the 3D illustrations for the app (assets/images/tiles/*.webp)
// =====================================================================

const TILE_UI = '<script>' +
  'onmessage = async function (ev) {' +
  '  const d = ev.data.pluginMessage; const out = [];' +
  '  try {' +
  '    for (const f of d.files) {' +
  '      const bmp = await createImageBitmap(new Blob([f.bytes]));' +
  '      const scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));' +
  '      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);' +
  '      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);' +
  '      const blob = await new Promise(function (r) { c.toBlob(r, "image/webp", 0.88); });' +
  '      if (!blob || blob.type !== "image/webp") throw new Error("WebP encoding not supported here");' +
  '      const r = await fetch("' + RECEIVER + '/asset/" + f.name, { method: "POST", body: blob });' +
  '      if (!r.ok) throw new Error(f.name + ": receiver said " + r.status);' +
  '      out.push(f.name + " " + c.width + "x" + c.height + " " + Math.round(blob.size / 1024) + "KB");' +
  '    }' +
  '    await fetch("' + RECEIVER + '/report/tiles", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ files: out }) });' +
  '    parent.postMessage({ pluginMessage: { ok: true, files: out } }, "*");' +
  '  } catch (e) { parent.postMessage({ pluginMessage: { ok: false, error: String(e && e.message ? e.message : e) } }, "*"); }' +
  '};' +
  '</script>';

async function runExportTiles() {
  const home = await figma.getNodeByIdAsync('2702:1431');
  if (!home) throw new Error('HealthHub / Home (2702:1431) not found.');
  let page = home; while (page && page.type !== 'PAGE') page = page.parent;
  if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
  // the originals live in the archive copy of the old Homepage
  const archive = page.children.filter(function (n) { return n.type === 'SECTION' && n.name === 'HealthHub / _archive'; })[0];
  const copy = archive ? archive.findOne(function (n) { return n.getPluginData('origId') === '2702:1431'; }) : null;
  await harvestFrom([copy, home]);
  const NAMES = { consult: 'consult', lab: 'lab-tests', vaccine: 'vaccines', pet: 'pet-care' };
  const files = [];
  for (const k of Object.keys(NAMES)) {
    if (!IMG[k]) continue;
    const img = figma.getImageByHash(IMG[k].imageHash);
    if (img) files.push({ name: NAMES[k], bytes: await img.getBytesAsync() });
  }
  if (!files.length) throw new Error('No 3D tile images found in the archive copy of the old Home.');
  const res = await new Promise(function (resolve) {
    figma.showUI(TILE_UI, { visible: false });
    figma.ui.onmessage = resolve;
    figma.ui.postMessage({ files: files });
  });
  if (!res.ok) throw new Error(res.error + ' (is the receiver running?)');
  return '✓ Exported ' + res.files.length + ' tile images: ' + res.files.join(', ');
}

async function main() {
  try {
    let msg;
    if (figma.command === 'a1') msg = await runA1();
    else if (figma.command === 'a2') msg = await runA2();
    else if (figma.command === 'a3') msg = await runA3();
    else if (figma.command === 'a4') msg = await runA4();
    else if (figma.command === 'a5a') msg = await runA5a();
    else if (figma.command === 'fixbg') msg = await runFixBg();
    else if (figma.command === 'a5b') msg = await runA5b();
    else if (figma.command === 'a5c') msg = await runA5c();
    else if (figma.command === 'a6') msg = await runA6();
    else if (figma.command === 'tiles') msg = await runExportTiles();
    else throw new Error('Unknown command: ' + figma.command);
    figma.closePlugin(msg);
  } catch (e) {
    console.error(e);
    figma.closePlugin('⚠ HealthHub Builder: ' + (e && e.message ? e.message : String(e)));
  }
}

main();
