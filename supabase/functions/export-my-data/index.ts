// "Download my data": everything this account holds, as data.json plus the original record files, in one zip.
// Reads go through the caller's own JWT, so row-level security decides what's included — never the service key.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { strToU8, zipSync } from 'npm:fflate@0.8.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'content-disposition',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TABLES = [
  'profiles', 'family_members', 'records', 'record_files', 'appointments', 'lab_bookings',
  'reminders', 'reminder_logs', 'consents',
] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Use POST.' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);

  const data: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, phone: user.phone ?? null, created_at: user.created_at },
  };
  for (const t of TABLES) {
    const { data: rows, error } = await db.from(t).select('*');
    if (error) return json({ error: `Couldn’t read ${t}.` }, 500);
    data[t] = rows;
  }

  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  for (const f of (data.record_files as { storage_path: string; file_name: string; id: string }[])) {
    const { data: blob } = await db.storage.from('records').download(f.storage_path);
    if (!blob) { missing.push(f.storage_path); continue; }
    // prefix with the id so two files with the same name don't overwrite each other
    files[`files/${f.id.slice(0, 8)}-${f.file_name.replace(/[\\/]/g, '_')}`] = new Uint8Array(await blob.arrayBuffer());
  }
  if (missing.length) data.missing_files = missing;

  const readme = [
    'HealthHub data export',
    '',
    'data.json  everything stored for your account: profile, family members, records, bookings, reminders and consents.',
    'files/     the photos and PDFs attached to your records.',
    '',
    `Exported ${data.exported_at}.`,
  ].join('\n');

  const zip = zipSync({
    'README.txt': strToU8(readme),
    'data.json': strToU8(JSON.stringify(data, null, 2)),
    ...files,
  });
  const name = `healthhub-export-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(zip, {
    headers: { ...cors, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"` },
  });
});
