// Printable HTML for a record (used for "Download PDF" on native and web).

import { RECORD_TYPE_LABEL, type HealthRecord, type Member } from '@/data/types';

import { dateLabel } from './dates';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** `images` are src values that work inside the HTML (data: URIs on iOS, blob/data URIs on web). */
export function recordHtml(r: HealthRecord, member: Member | undefined, images: string[]) {
  const rows: [string, string][] = [
    ['For', member?.name ?? '—'],
    ['Date', dateLabel(r.date)],
    ['Doctor or lab', r.provider || '—'],
    ['Files', String(r.attachments?.length ?? r.files)],
  ];
  const pdfs = (r.attachments ?? []).filter((f) => !f.mimeType.startsWith('image/'));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1B2333; font-size: 13px; }
  .brand { color: #1F2E5C; font-weight: 700; font-size: 14px; letter-spacing: .02em; }
  .kind { color: #0F7A68; font-weight: 600; text-transform: uppercase; font-size: 11px; margin-top: 18px; }
  h1 { font-size: 22px; margin: 4px 0 14px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  td { padding: 8px 0; border-bottom: 1px solid #E4E7EF; vertical-align: top; }
  td:first-child { color: #5B6475; width: 34%; }
  .notes { background: #F6F7FB; border-radius: 8px; padding: 12px; white-space: pre-wrap; }
  img { display: block; max-width: 100%; max-height: 240mm; margin: 16px auto 0; page-break-inside: avoid; }
  .foot { color: #5B6475; font-size: 11px; margin-top: 24px; }
</style></head><body>
<div class="brand">HealthHub</div>
<div class="kind">${esc(RECORD_TYPE_LABEL[r.type])}</div>
<h1>${esc(r.title)}</h1>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
${images.map((src) => `<img src="${src}" alt="">`).join('')}
${pdfs.length ? `<p class="foot">Attached PDFs, shared separately: ${pdfs.map((f) => esc(f.name)).join(', ')}</p>` : ''}
${!r.attachments?.length ? '<p class="foot">This record\'s original files are kept in HealthHub.</p>' : ''}
<p class="foot">Exported from HealthHub on ${dateLabel(new Date().toISOString().slice(0, 10))}.</p>
</body></html>`;
}

/** File-name-safe title: "Fever and cough – 12 Nov 2026.pdf" */
export const pdfName = (r: HealthRecord) => `${r.title} – ${dateLabel(r.date)}`.replace(/[\\/:*?"<>|]/g, '-');
