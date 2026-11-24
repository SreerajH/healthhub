// "Delete my account": frees any upcoming doctor slots, removes every stored file, then deletes the auth
// user — which cascades through profiles to every row the account owns.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);

  let body: { confirm?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  // the app makes people type DELETE; check it here too so a stray call can't wipe an account
  if (body.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const uid = user.id;

  // 1. give upcoming doctor slots back, so other patients can book them
  const { data: upcoming } = await admin.from('appointments')
    .select('slot_id').eq('owner_id', uid).eq('status', 'upcoming').gt('starts_at', new Date().toISOString());
  const slotIds = (upcoming ?? []).map((a) => a.slot_id).filter(Boolean) as string[];
  if (slotIds.length) {
    const { error } = await admin.from('doctor_slots').update({ is_booked: false }).in('id', slotIds);
    if (error) return json({ error: 'Couldn’t release your bookings. Nothing was deleted.' }, 500);
  }

  // 2. every stored file (paths are uid/member/record/file, and each has a record_files row)
  const { data: rows } = await admin.from('record_files').select('storage_path').eq('owner_id', uid);
  const all = (rows ?? []).map((r) => r.storage_path);
  for (let i = 0; i < all.length; i += 100) {
    const { error } = await admin.storage.from('records').remove(all.slice(i, i + 100));
    if (error) return json({ error: 'Couldn’t remove your files. Your account is still here; try again.' }, 500);
  }

  // 3. the account itself; profiles and everything under them cascade
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ error: 'Your files were removed, but the account couldn’t be deleted. Try again.' }, 500);

  return json({ deleted: true, files: all.length, slots_released: slotIds.length });
});
