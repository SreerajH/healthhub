// Cancels a booking, or moves a doctor visit to another slot. Slots are freed and re-locked inside
// Postgres (cancel_booking / reschedule_appointment), and the change windows are enforced there.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ERRORS: Record<string, [number, string]> = {
  booking_not_found: [404, 'We couldn’t find that booking.'],
  not_upcoming: [409, 'That booking has already been cancelled or completed.'],
  too_late: [409, 'It’s too close to the time to change this online. Please call to change it.'],
  slot_not_found: [404, 'That time isn’t available.'],
  slot_taken: [409, 'That slot has just been taken. Pick another time.'],
  slot_too_soon: [409, 'That time is too soon. Pick a later one.'],
  kind_invalid: [400, 'Unknown booking type.'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }

  const { action, kind, id, reason, slot_id } = body as Record<string, string>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof id !== 'string' || !uuid.test(id)) return json({ error: 'Choose a booking.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let result;

  if (action === 'cancel') {
    result = await admin.rpc('cancel_booking', { p_owner: user.id, p_kind: kind, p_id: id, p_reason: reason ?? '' });
  } else if (action === 'reschedule') {
    if (typeof slot_id !== 'string' || !uuid.test(slot_id)) return json({ error: 'Choose a new time.' }, 400);
    result = await admin.rpc('reschedule_appointment', { p_owner: user.id, p_id: id, p_slot: slot_id });
  } else {
    return json({ error: 'Unknown action.' }, 400);
  }

  if (result.error) {
    const [status, message] = ERRORS[result.error.message] ?? [500, 'Couldn’t make that change. Try again.'];
    if (!ERRORS[result.error.message]) console.error(`${action} failed:`, result.error.message);
    return json({ error: message, code: result.error.message }, status);
  }
  return json({ result: result.data });
});
