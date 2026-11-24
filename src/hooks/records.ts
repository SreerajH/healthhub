// Health records and their files. Files live in a private bucket, so the app reads them
// through short-lived signed URLs.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { HealthRecord, RecordFile, RecordType } from '@/data/types';
import { useAuth } from '@/lib/auth';
import { toRecord, toRecordFile } from '@/lib/map';
import { supabase } from '@/lib/supabase';

export const recordsKey = ['records'] as const;
const SIGNED_URL_SECONDS = 600;

export function useRecords() {
  const { user } = useAuth();
  return useQuery({
    queryKey: recordsKey,
    enabled: !!user,
    queryFn: async (): Promise<HealthRecord[]> => {
      const { data, error } = await supabase
        .from('records')
        .select('*, record_files(count)')
        .order('record_date', { ascending: false });
      if (error) throw error;
      return data.map(toRecord);
    },
  });
}

export function useRecord(id?: string) {
  const { data: records } = useRecords();
  return records?.find((r) => r.id === id);
}

/** The files on one record, with signed URLs that last ten minutes. */
export function useRecordFiles(recordId?: string) {
  return useQuery({
    queryKey: ['record-files', recordId],
    enabled: !!recordId,
    staleTime: (SIGNED_URL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<RecordFile[]> => {
      const { data, error } = await supabase.from('record_files').select('*').eq('record_id', recordId!).order('created_at');
      if (error) throw error;
      if (!data.length) return [];
      const { data: signed, error: signError } = await supabase.storage
        .from('records')
        .createSignedUrls(data.map((f) => f.storage_path), SIGNED_URL_SECONDS);
      if (signError) throw signError;
      return data.map((row, i) => toRecordFile(row, signed[i]?.signedUrl ?? ''));
    },
  });
}

export type NewRecord = {
  memberId: string;
  type: RecordType;
  title: string;
  provider: string;
  date: string;
  notes?: string;
  files: { uri: string; name: string; mimeType: string; size: number; width?: number; height?: number }[];
  onProgress?: (fileIndex: number, pct: number) => void;
};

/**
 * Creates the record, then uploads its files. If an upload fails, everything created here is
 * removed again, so a half-uploaded record never shows up in the list.
 */
export function useAddRecord() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewRecord) => {
      const { data: record, error } = await supabase
        .from('records')
        .insert({
          owner_id: user!.id,
          member_id: input.memberId,
          type: input.type,
          title: input.title,
          record_date: input.date,
          provider_name: input.provider || null,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      const uploaded: string[] = [];
      try {
        for (let i = 0; i < input.files.length; i++) {
          const f = input.files[i];
          const ext = f.name.includes('.') ? f.name.split('.').pop() : f.mimeType.split('/')[1];
          const path = `${user!.id}/${input.memberId}/${record.id}/${i + 1}-${Date.now()}.${ext}`;
          input.onProgress?.(i, 10);

          const body = await (await fetch(f.uri)).arrayBuffer();
          input.onProgress?.(i, 45);

          const { error: upError } = await supabase.storage.from('records').upload(path, body, { contentType: f.mimeType, upsert: false });
          if (upError) throw upError;
          uploaded.push(path);
          input.onProgress?.(i, 85);

          const { error: rowError } = await supabase.from('record_files').insert({
            record_id: record.id,
            owner_id: user!.id,
            storage_path: path,
            file_name: f.name,
            mime_type: f.mimeType,
            size_bytes: f.size,
            width: f.width ?? null,
            height: f.height ?? null,
          });
          if (rowError) throw rowError;
          input.onProgress?.(i, 100);
        }
      } catch (e) {
        if (uploaded.length) await supabase.storage.from('records').remove(uploaded);
        await supabase.from('records').delete().eq('id', record.id);
        throw new Error(uploadErrorMessage(e));
      }

      return record.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey }),
  });
}

/** Removes the files from storage first, then the rows. */
export function useRemoveRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: files } = await supabase.from('record_files').select('storage_path').eq('record_id', id);
      if (files?.length) await supabase.storage.from('records').remove(files.map((f) => f.storage_path));
      const { error } = await supabase.from('records').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey }),
  });
}

/** Storage errors are written for developers; this is what someone uploading a file should read. */
function uploadErrorMessage(e: unknown) {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (m.includes('mime') || m.includes('file type')) return 'One of those files isn’t a photo or a PDF, so nothing was saved. Try again without it.';
  if (m.includes('size') || m.includes('too large') || m.includes('exceeded')) return 'One of those files is over 10 MB, so nothing was saved.';
  if (m.includes('network') || m.includes('fetch')) return 'The upload was interrupted and nothing was saved. Check your connection and try again.';
  return 'Couldn’t save the record, so nothing was kept. Try again.';
}
