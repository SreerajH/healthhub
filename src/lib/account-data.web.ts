// Web: fetch the zip and hand it to the browser as a download.
import { authHeaders, deleteMyAccount, exportName, exportUrl } from './account-data.shared';

export { deleteMyAccount };

export async function downloadMyData(): Promise<void> {
  const res = await fetch(exportUrl, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Couldn’t prepare your data. Try again.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = exportName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
