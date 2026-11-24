// Books a doctor's slot. The caller is identified from their JWT; the fee and the slot lock are
// decided inside Postgres (book_appointment), never from anything the client sends.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// database error codes -> HTTP status and a message fit to show
const ERRORS: Record<string, [number, string]> = {
  member_not_yours: [403, 'That family member isn’t on your account.'],
  doctor_not_found: [404, 'That doctor isn’t available.'],
  slot_not_found: [404, 'That time isn’t available.'],
  slot_taken: [409, 'That slot has just been taken. Pick another time.'],
  slot_too_soon: [409, 'That time is too soon to book. Pick a later one.'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: 'Sign in to book.' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Send JSON.' }, 400); }

  const { member_id, doctor_id, slot_id, payment } = body as Record<string, string>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![member_id, doctor_id, slot_id].every((v) => typeof v === 'string' && uuid.test(v))) {
    return json({ error: 'Choose a family member, a doctor and a time.' }, 400);
  }
  if (!['upi', 'card', 'later'].includes(payment)) return json({ error: 'Choose how to pay.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Payment goes here. 'upi' and 'card' are simulated as successful for now; Razorpay replaces this
  // block: create the order, verify the signature, and only then call book_appointment.

  const { data, error } = await admin.rpc('book_appointment', {
    p_owner: user.id, p_member: member_id, p_doctor: doctor_id, p_slot: slot_id, p_payment: payment,
  });
  if (error) {
    const [status, message] = ERRORS[error.message] ?? [500, 'Couldn’t complete the booking. Try again.'];
    if (!ERRORS[error.message]) console.error('book_appointment failed:', error.message);
    return json({ error: message, code: error.message }, status);
  }
  return json({ booking: data });
});
