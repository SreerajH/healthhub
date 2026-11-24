import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, Radius, Space } from '@/constants/healthhub';

import { Button } from './button';
import { Chip } from './controls';

export type TimeChipProps = {
  /** called with "HH:MM" (24-hour) */
  onPick: (hhmm: string) => void;
  label?: string;
};

const toHHMM = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** A chip that opens the system time picker, for times the preset chips don't cover. Web: time-chip.web.tsx. */
export function TimeChip({ onPick, label = 'Other time…' }: TimeChipProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date());
  const insets = useSafeAreaInsets();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: new Date(), mode: 'time', onValueChange: (_e, d) => onPick(toHHMM(d)) });
    } else {
      setDraft(new Date());
      setIosOpen(true);
    }
  };

  return (
    <>
      <Chip label={label} onPress={open} />
      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={() => setIosOpen(false)}>
          <View style={styles.scrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setIosOpen(false)} accessibilityLabel="Close time picker" accessibilityRole="button" />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.lg }]}>
              <DateTimePicker value={draft} mode="time" display="spinner" themeVariant="light" onValueChange={(_e, d) => setDraft(d)} />
              <Button label="Add time" onPress={() => { onPick(toHHMM(draft)); setIosOpen(false); }} />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, padding: Space.lg, gap: Space.md },
});
