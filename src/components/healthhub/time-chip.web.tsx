import { createElement } from 'react';

import { C, Font, Radius, Space } from '@/constants/healthhub';

import type { TimeChipProps } from './time-chip';

/** Web: the browser's native time input, shaped like a chip. */
export function TimeChip({ onPick, label = 'Other time…' }: TimeChipProps) {
  return createElement('input', {
    type: 'time',
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => { if (e.target.value) onPick(e.target.value); },
    style: {
      height: 36, marginTop: 4, marginBottom: 4, boxSizing: 'border-box', borderRadius: Radius.pill, padding: `0 ${Space.md}px`,
      border: `1px solid ${C.borderStrong}`, background: C.card, color: C.text, fontFamily: Font.medium, fontSize: 15, outline: 'none',
    },
  });
}
