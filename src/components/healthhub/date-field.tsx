import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Space, Type } from '@/constants/healthhub';
import { dateLabel } from '@/lib/dates';

import { Button } from './button';
import { HelperText } from './forms';
import { Icon } from './icon';

export type DateFieldProps = {
  label: string;
  /** "YYYY-MM-DD" or null */
  value: string | null;
  onChange: (iso: string) => void;
  maximumDate?: Date;
  helper?: string;
  error?: string | null;
};

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00') : new Date(2000, 0, 1, 12));

/** Date of birth field: Android's calendar dialog, an inline calendar sheet on iOS. Web: date-field.web.tsx. */
export function DateField({ label, value, onChange, maximumDate = new Date(), helper, error }: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(fromIso(value));
  const insets = useSafeAreaInsets();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromIso(value),
        mode: 'date',
        maximumDate,
        onValueChange: (_e, d) => onChange(toIso(d)),
      });
    } else {
      setDraft(fromIso(value));
      setIosOpen(true);
    }
  };

  return (
    <View style={{ gap: Space.sm }}>
      <Text style={[Type.bodyMedium, { color: C.text }]}>{label}</Text>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? dateLabel(value) : 'not set'}`}
        accessibilityHint="Opens a calendar"
        style={[styles.field, !!error && styles.fieldError]}>
        <Text style={[Type.body, { color: value ? C.text : C.textSecondary, flex: 1 }]}>{value ? dateLabel(value) : 'Choose a date'}</Text>
        <Icon name="Calendar" size={22} color={C.textSecondary} />
      </Pressable>
      <HelperText helper={helper} error={error} />

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <View style={styles.scrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIosOpen(false)} accessibilityLabel="Close calendar" accessibilityRole="button" />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.lg }]}>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                maximumDate={maximumDate}
                accentColor={C.primary}
                themeVariant="light"
                onValueChange={(_e, d) => setDraft(d)}
              />
              <Button label="Done" onPress={() => { onChange(toIso(draft)); setIosOpen(false); }} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 52, borderRadius: Radius.button, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.card,
    paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', gap: Space.sm,
  },
  fieldError: { borderColor: C.danger, borderWidth: 2 },
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, padding: Space.lg, gap: Space.md },
});
