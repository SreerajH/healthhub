// Web share / PDF export: the Web Share API where the browser has it, and the browser's
// print dialog ("Save as PDF") for the PDF.

import type { HealthRecord, Member } from '@/data/types';

import { dateLabel } from './dates';
import { pdfName, recordHtml } from './record-html';

export type ShareOutcome = 'shared' | 'unavailable';

export async function shareRecord(r: HealthRecord, member: Member | undefined): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unavailable';
  const text = `${r.title} · ${member?.name ?? ''} · ${dateLabel(r.date)}${r.provider ? ` · ${r.provider}` : ''}`;
  try {
    const files = await Promise.all(
      (r.attachments ?? []).map(async (f) => new File([await (await fetch(f.uri)).blob()], f.name, { type: f.mimeType })),
    );
    if (files.length && navigator.canShare?.({ files })) await navigator.share({ title: r.title, text, files });
    else await navigator.share({ title: r.title, text });
    return 'shared';
  } catch (e) {
    // the user closed the share sheet
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    return 'unavailable';
  }
}

/** Prints the record from a hidden frame, so the browser offers "Save as PDF". */
export async function downloadPdf(r: HealthRecord, member: Member | undefined): Promise<ShareOutcome> {
  if (typeof document === 'undefined') return 'unavailable';
  const images = (r.attachments ?? []).filter((f) => f.mimeType.startsWith('image/')).map((f) => f.uri);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(recordHtml(r, member, images).replace(/<title>.*?<\/title>/, `<title>${pdfName(r)}</title>`));
  doc.close();
  await new Promise<void>((done) => {
    const imgs = Array.from(doc.images);
    let left = imgs.length;
    if (!left) return done();
    imgs.forEach((i) => (i.complete ? --left || done() : (i.onload = i.onerror = () => --left || done())));
  });
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => frame.remove(), 60_000);
  return 'shared';
}
