// Picking and preparing record files. Images are compressed before upload (max 2000px, 80% JPEG);
// PDFs are kept as they are. Uploading itself is simulated until Part C (Supabase Storage).

import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { RecordFile } from '@/data/types';

const MAX_SIDE = 2000;
const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same limit as the Storage bucket in Part C

export type PickResult = { files: RecordFile[]; error?: string };
const newId = () => 'f-' + Math.random().toString(36).slice(2, 9);

/** Compress a photo: decode at most 2000px on the long side, re-save as 80% JPEG. */
export async function compressImage(uri: string, name: string): Promise<RecordFile> {
  const ctx = ImageManipulator.manipulate(uri, { maxWidth: MAX_SIDE, maxHeight: MAX_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const size = await sizeOf(out.uri);
  return { id: newId(), uri: out.uri, name: name.replace(/\.(heic|heif|png|webp|jpeg)$/i, '.jpg'), mimeType: 'image/jpeg', size, width: out.width, height: out.height };
}

async function sizeOf(uri: string) {
  try {
    const res = await fetch(uri);
    return (await res.blob()).size;
  } catch {
    return 0;
  }
}

export async function pickFromCamera(): Promise<PickResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { files: [], error: 'Allow camera access in Settings to photograph a record' };
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled) return { files: [] };
  return { files: [await compressImage(res.assets[0].uri, `Photo ${new Date().toISOString().slice(0, 10)}.jpg`)] };
}

export async function pickFromGallery(): Promise<PickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { files: [], error: 'Allow photo access in Settings to add a record' };
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_FILES, quality: 1 });
  if (res.canceled) return { files: [] };
  const files: RecordFile[] = [];
  for (const a of res.assets) files.push(await compressImage(a.uri, a.fileName ?? 'Photo.jpg'));
  return { files };
}

export async function pickPdf(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return { files: [] };
  const tooBig = res.assets.filter((a) => (a.size ?? 0) > MAX_BYTES);
  const files = res.assets
    .filter((a) => (a.size ?? 0) <= MAX_BYTES)
    .map((a) => ({ id: newId(), uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size ?? 0 }));
  return { files, error: tooBig.length ? `${tooBig.map((a) => a.name).join(', ')} is over 10 MB` : undefined };
}

/** "1.2 MB", "640 KB" */
export function fileSize(bytes: number) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const isImage = (f: Pick<RecordFile, 'mimeType'>) => f.mimeType.startsWith('image/');

/**
 * Simulated upload (until Supabase Storage in Part C): reports 0→100% per file.
 * Resolves when every file is "uploaded".
 */
export async function simulateUpload(files: RecordFile[], onProgress: (fileId: string, pct: number) => void) {
  for (const f of files) {
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, 90));
      onProgress(f.id, Math.round((i / steps) * 100));
    }
  }
}

export { MAX_FILES };
