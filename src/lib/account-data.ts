// "Download my data" and "Delete my account": both run in Edge Functions (export-my-data, delete-account).
// The download on web is account-data.web.ts.

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { authHeaders, deleteMyAccount, exportName, exportUrl } from './account-data.shared';

export { deleteMyAccount };

/** Downloads the zip into the cache and opens the share sheet, so it can be saved to Files or Drive. */
export async function downloadMyData(): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = await File.downloadFileAsync(exportUrl, new File(dir, exportName()), {
    headers: await authHeaders(), idempotent: true,
  });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: 'Save your HealthHub data', UTI: 'public.zip-archive' });
}
