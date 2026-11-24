// Native share / PDF export. Web has its own version in share-record.web.ts.
//
// Record files live in a private bucket and reach the app as short-lived https signed URLs.
// The share sheet and the image manipulator both need a local file, so each one is downloaded
// into the cache first.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { HealthRecord, Member, RecordFile } from '@/data/types';

import { recordHtml } from './record-html';

export type ShareOutcome = 'shared' | 'unavailable';

/** A local copy of a record file (remote signed URLs are downloaded into the cache). */
async function localCopy(f: RecordFile) {
  if (!/^https?:/.test(f.uri)) return f.uri;
  const dir = new Directory(Paths.cache, 'records');
  if (!dir.exists) dir.create({ intermediates: true });
  // keep the original name so the receiving app shows something sensible
  const safe = f.name.replace(/[\\/:*?"<>|]/g, '-');
  const file = await File.downloadFileAsync(f.uri, new File(dir, `${f.id}-${safe}`), { idempotent: true });
  return file.uri;
}

/** iOS can't load local file URLs inside print HTML, so photos are inlined as base64 JPEG. */
async function inlineImages(files: RecordFile[]) {
  const out: string[] = [];
  for (const f of files) {
    if (!f.mimeType.startsWith('image/')) continue;
    const img = await ImageManipulator.manipulate(await localCopy(f), { maxWidth: 1600, maxHeight: 1600 }).renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    if (saved.base64) out.push(`data:image/jpeg;base64,${saved.base64}`);
  }
  return out;
}

async function buildPdf(r: HealthRecord, member: Member | undefined) {
  const { uri } = await Print.printToFileAsync({ html: recordHtml(r, member, await inlineImages(r.attachments ?? [])) });
  return uri;
}

/** Share: a single file goes out as it is; otherwise a PDF of the whole record. */
export async function shareRecord(r: HealthRecord, member: Member | undefined): Promise<ShareOutcome> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const one = r.attachments?.length === 1 ? r.attachments[0] : null;
  if (one) {
    await Sharing.shareAsync(await localCopy(one), {
      mimeType: one.mimeType, dialogTitle: r.title, UTI: one.mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.jpeg',
    });
  } else {
    await Sharing.shareAsync(await buildPdf(r, member), { mimeType: 'application/pdf', dialogTitle: r.title, UTI: 'com.adobe.pdf' });
  }
  return 'shared';
}

/** Download PDF: build it, then hand it to the share sheet ("Save to Files", Drive, WhatsApp…). */
export async function downloadPdf(r: HealthRecord, member: Member | undefined): Promise<ShareOutcome> {
  const uri = await buildPdf(r, member);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Save ${r.title}`, UTI: 'com.adobe.pdf' });
  return 'shared';
}
