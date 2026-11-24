import { PURPOSES, useConsentAsk, useSetConsents } from '@/lib/consent';

import { ConfirmDialog, useToast } from './feedback';

/** The just-in-time ask behind useEnsureConsent(): mounted once in the root layout. */
export function ConsentPrompt() {
  const { ask, set } = useConsentAsk();
  const setConsents = useSetConsents();
  const toast = useToast();
  const p = ask ? PURPOSES.find((x) => x.id === ask.purpose)! : null;

  const finish = (ok: boolean) => { ask?.resolve(ok); set(null); };

  return (
    <ConfirmDialog
      visible={!!p}
      tone="primary"
      icon="Lock"
      title={p ? `Allow ${p.title.toLowerCase()}?` : ''}
      message={p ? `${p.what} ${p.why} You can withdraw this any time in Privacy and data.` : ''}
      confirmLabel="Allow"
      cancelLabel="Not now"
      onCancel={() => finish(false)}
      onConfirm={() => {
        if (!ask) return;
        setConsents.mutate({ grant: [ask.purpose] }, {
          onSuccess: () => finish(true),
          onError: () => { toast({ message: 'Couldn’t save that. Try again.', type: 'error' }); finish(false); },
        });
      }}
    />
  );
}
