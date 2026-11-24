import { createElement } from 'react';
import { Text, View } from 'react-native';

import { C, Font, Radius, Space, Type } from '@/constants/healthhub';

import type { DateFieldProps } from './date-field';
import { HelperText } from './forms';

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Web: the browser's native date input, styled like the other fields (the community picker has no web support). */
export function DateField({ label, value, onChange, maximumDate = new Date(), helper, error }: DateFieldProps) {
  return (
    <View style={{ gap: Space.sm }}>
      <Text style={[Type.bodyMedium, { color: C.text }]}>{label}</Text>
      {createElement('input', {
        type: 'date',
        value: value ?? '',
        max: toIso(maximumDate),
        'aria-label': label,
        'aria-invalid': !!error,
        onChange: (e: { target: { value: string } }) => { if (e.target.value) onChange(e.target.value); },
        style: {
          height: 52, boxSizing: 'border-box', borderRadius: Radius.button, padding: `0 ${Space.lg}px`,
          border: `${error ? 2 : 1}px solid ${error ? C.danger : C.borderStrong}`, background: C.card,
          color: value ? C.text : C.textSecondary, fontFamily: Font.regular, fontSize: 15, outline: 'none',
        },
      })}
      <HelperText helper={helper} error={error} />
    </View>
  );
}

