// Books a home lab collection. The total is price x people, computed in Postgres (book_lab).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ERRORS: Record<string, [number, string]> = {
  members_invalid: [400, 'Choose between 1 and 8 people.'],
  member_not_yours: [403, 'One of those people isn’t on your account.'],
  package_not_found: [404, 'That test isn’t available.'],
  not_eligible: [409, 'This package isn’t suitable for one of the people chosen.'],
  time_invalid: [409, 'Pick a collection time from tomorrow, in the morning rounds, within two weeks.'],
  address_invalid: [400, 'Enter the full collection address.'],
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

  const { member_ids, package_id, address, address_label, starts_at, payment } = body as {
    member_ids?: string[]; package_id?: string; address?: string; address_label?: string; starts_at?: string; payment?: string;
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(member_ids) || !member_ids.every((v) => typeof v === 'string' && uuid.test(v))) {
    return json({ error: 'Choose who the test is for.' }, 400);
  }
  if (typeof package_id !== 'string' || !uuid.test(package_id)) return json({ error: 'Choose a test.' }, 400);
  if (typeof starts_at !== 'string' || Number.isNaN(Date.parse(starts_at))) return json({ error: 'Choose a collection time.' }, 400);
  if (!['upi', 'card', 'later'].includes(payment ?? '')) return json({ error: 'Choose how to pay.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Payment goes here (simulated as successful for now; Razorpay replaces this block).

  const { data, error } = await admin.rpc('book_lab', {
    p_owner: user.id, p_members: member_ids, p_package: package_id, p_address: address ?? '',
    p_address_label: address_label ?? '', p_starts_at: new Date(starts_at).toISOString(), p_payment: payment,
  });
  if (error) {
    const [status, message] = ERRORS[error.message] ?? [500, 'Couldn’t complete the booking. Try again.'];
    if (!ERRORS[error.message]) console.error('book_lab failed:', error.message);
    return json({ error: message, code: error.message }, status);
  }
  return json({ booking: data });
});
