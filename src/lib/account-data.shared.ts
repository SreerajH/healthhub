// The parts of account-data that are the same on every platform.
import { supabase } from './supabase';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

export async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again first.');
  return { Authorization: `Bearer ${token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY! };
}

export const exportUrl = `${FN_URL}/export-my-data`;
export const exportName = () => `healthhub-export-${new Date().toISOString().slice(0, 10)}.zip`;

/** Permanently deletes the account on the server; the caller signs out afterwards. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
  if (error) {
    let message = 'Couldn’t delete your account. Check your connection and try again.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch { /* keep the default */ }
    throw new Error(message);
  }
}
