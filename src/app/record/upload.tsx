import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChipGroup, DateField, Field, Icon, IconButton, TopBar, useToast, type IconName } from '@/components/healthhub';
import { C, Radius, Space, Type } from '@/constants/healthhub';
import { RECORD_TYPE_LABEL, todayISO, type RecordFile, type RecordType } from '@/data/types';
import { useEnsureConsent } from '@/lib/consent';
import { firstName } from '@/lib/family';
import { useAddRecord, useMembers } from '@/hooks';
import { fileSize, isImage, MAX_FILES, pickFromCamera, pickFromGallery, pickPdf, type PickResult } from '@/lib/upload';

const TYPES: { value: RecordType; label: string }[] = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab report' },
  { value: 'scan', label: 'Scan' },
  { value: 'vaccine', label: 'Vaccine' },
  { value: 'discharge', label: 'Discharge summary' },
  { value: 'other', label: 'Other' },
];
const SOURCES: { key: 'camera' | 'gallery' | 'pdf'; label: string; a11y: string; icon: IconName; pick: () => Promise<PickResult> }[] = [
  { key: 'camera', label: 'Camera', a11y: 'Take a photo', icon: 'Camera', pick: pickFromCamera },
  { key: 'gallery', label: 'Gallery', a11y: 'Add photos from gallery', icon: 'Gallery', pick: pickFromGallery },
  { key: 'pdf', label: 'PDF file', a11y: 'Add a PDF file', icon: 'Document', pick: pickPdf },
];

/** Figma "HealthHub / Upload record": add files, say what and who it's for, save with progress. */
export default function UploadRecordScreen() {
  const params = useLocalSearchParams<{ member?: string }>();
  const { data: members = [] } = useMembers();
  const addRecord = useAddRecord();
  const ensureConsent = useEnsureConsent();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [files, setFiles] = useState<RecordFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // which source is preparing files
  const [type, setType] = useState<RecordType | null>(null);
  const [memberId, setMemberId] = useState<string | null>(
    params.member && members.some((m) => m.id === params.member) ? params.member : null,
  );
  const [date, setDate] = useState<string | null>(todayISO());
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<Record<string, number> | null>(null);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!files.length) m.push('a file');
    if (!type) m.push('record type');
    if (!memberId) m.push('who it\'s for');
    if (!date) m.push('date');
    return m;
  }, [files, type, memberId, date]);
  const saving = progress !== null;
  const room = MAX_FILES - files.length;

  const addFrom = async (s: (typeof SOURCES)[number]) => {
    if (room <= 0) return toast({ message: `You can add up to ${MAX_FILES} files to one record`, type: 'error' });
    setBusy(s.key);
    try {
      const res = await s.pick();
      if (res.error) toast({ message: res.error, type: 'error' });
      if (res.files.length) setFiles((f) => [...f, ...res.files].slice(0, MAX_FILES));
    } catch {
      toast({ message: 'That file couldn\'t be added. Try another one.', type: 'error' });
    } finally {
      setBusy((b) => (b === s.key ? null : b));
    }
  };

  const save = async () => {
    if (missing.length || saving) return;
    if (!(await ensureConsent('records'))) return;
    setProgress({});
    try {
      const id = await addRecord.mutateAsync({
        memberId: memberId!,
        type: type!,
        title: title.trim() || RECORD_TYPE_LABEL[type!],
        provider: provider.trim(),
        date: date!,
        notes: notes.trim() || undefined,
        files: files.map((f) => ({ uri: f.uri, name: f.name, mimeType: f.mimeType, size: f.size, width: f.width, height: f.height })),
        onProgress: (index, pct) => setProgress((p) => ({ ...p, [files[index].id]: pct })),
      });
      const m = members.find((x) => x.id === memberId);
      toast({ message: `Saved to ${m?.relation === 'self' ? 'your' : (m ? firstName(m) + '\'s' : 'their')} records` });
      router.replace({ pathname: '/record/[id]', params: { id } });
    } catch (e) {
      setProgress(null);
      toast({ message: e instanceof Error ? e.message : 'Couldn’t save the record', type: 'error' });
    }
  };

  // overall progress for the footer: "Uploading 1 of 2 · 64%"
  const done = progress ? files.filter((f) => (progress[f.id] ?? 0) >= 100).length : 0;
  const current = progress ? files.find((f) => (progress[f.id] ?? 0) < 100) : undefined;
  const overall = progress && files.length ? Math.round(files.reduce((s, f) => s + (progress[f.id] ?? 0), 0) / files.length) : 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title="Upload record" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: Space.sm }}>
          <Text style={[Type.bodyMedium, { color: C.text }]}>Add files</Text>
          <View style={styles.sources}>
            {SOURCES.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => addFrom(s)}
                // not disabled while another picker is open: on web a dismissed file chooser
                // may never report back, and that mustn't lock the other sources
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={s.a11y}
                accessibilityState={{ disabled: saving, busy: busy === s.key }}
                style={({ pressed }) => [styles.source, pressed && { backgroundColor: C.primarySoft }, saving && { opacity: 0.5 }]}>
                <View style={styles.sourceIcon}>
                  <Icon name={s.icon} size={24} color={C.primary} />
                </View>
                <Text style={[Type.bodyMedium, { color: C.text }]}>{busy === s.key ? 'Preparing…' : s.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[Type.caption, { color: C.textSecondary }]}>
            Photos are compressed to save space. PDFs up to 10 MB. Up to {MAX_FILES} files.
          </Text>
        </View>

        {files.length ? (
          <View style={{ gap: Space.sm }} accessibilityLabel={`${files.length} file${files.length === 1 ? '' : 's'} added`}>
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                pct={progress ? progress[f.id] ?? 0 : null}
                onRemove={saving ? undefined : () => setFiles((x) => x.filter((y) => y.id !== f.id))}
              />
            ))}
          </View>
        ) : null}

        <ChipGroup label="Record type" options={TYPES} value={type} onChange={setType} />

        <ChipGroup
          label="Who is it for?"
          options={members.map((m) => ({ value: m.id, label: m.relation === 'self' ? 'You' : firstName(m) }))}
          value={memberId}
          onChange={setMemberId}
        />

        <DateField label="Date on the record" value={date} onChange={setDate} helper="The date of the visit, test or scan." />

        <Field label="Title (optional)" value={title} onChangeText={setTitle}
          placeholder={type ? `e.g. ${TITLE_HINT[type]}` : 'e.g. Fever and cough'} maxLength={80} />

        <Field label="Doctor or lab (optional)" value={provider} onChangeText={setProvider}
          placeholder="e.g. Lal PathLabs, Indiranagar" autoCapitalize="words" maxLength={80} />

        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Dosage, follow-up date, anything to remember"
          multiline maxLength={500} style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }} />

        <View style={styles.privacy}>
          <Icon name="Lock" size={20} color={C.tealText} />
          <Text style={[Type.caption, { color: C.text, flex: 1 }]}>
            Only you can see your family&apos;s records. Files are encrypted when they&apos;re stored.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
        {saving ? (
          <View style={{ gap: Space.xs }} accessibilityLiveRegion="polite">
            <Text style={[Type.caption, { color: C.text, textAlign: 'center' }]}>
              {current ? `Uploading ${done + 1} of ${files.length} · ${overall}%` : 'Saving…'}
            </Text>
            <ProgressBar pct={overall} />
          </View>
        ) : missing.length ? (
          <Text style={[Type.caption, { color: C.textSecondary, textAlign: 'center' }]} accessibilityLiveRegion="polite">
            Still needed: {listOf(missing)}
          </Text>
        ) : null}
        <Button label={saving ? 'Uploading…' : 'Save record'} onPress={save} disabled={!!missing.length} loading={saving} fill />
      </View>
    </KeyboardAvoidingView>
  );
}

const TITLE_HINT: Record<RecordType, string> = {
  prescription: 'Fever and cough', lab_report: 'Complete blood count', scan: 'Chest X-ray',
  vaccine: 'Flu vaccine', discharge: 'Knee surgery', other: 'Insurance card',
};

function FileRow({ file, pct, onRemove }: { file: RecordFile; pct: number | null; onRemove?: () => void }) {
  const img = isImage(file);
  return (
    <View style={styles.file}>
      {img ? (
        <Image source={{ uri: file.uri }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, styles.pdfThumb]}>
          <Icon name="Document" size={22} color={C.dangerText} />
          <Text style={[Type.micro, { color: C.dangerText }]}>PDF</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[Type.bodyMedium, { color: C.text }]} numberOfLines={1}>{file.name}</Text>
        {pct !== null ? (
          <ProgressBar pct={pct} label={`${file.name} upload`} />
        ) : (
          <Text style={[Type.caption, { color: C.textSecondary }]}>
            {[img ? 'Photo' : 'PDF', fileSize(file.size), img && file.width ? `${file.width}×${file.height}` : ''].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      {pct !== null ? (
        pct >= 100 ? <Icon name="Tick Circle" size={22} color={C.teal} /> : <Text style={[Type.micro, { color: C.textSecondary, minWidth: 36, textAlign: 'right' }]}>{pct}%</Text>
      ) : onRemove ? (
        <IconButton icon="Close" accessibilityLabel={`Remove ${file.name}`} onPress={onRemove} />
      ) : null}
    </View>
  );
}

function ProgressBar({ pct, label }: { pct: number; label?: string }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <View style={[styles.bar, { width: `${pct}%` }]} />
    </View>
  );
}

function listOf(items: string[]) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  sources: { flexDirection: 'row', gap: Space.sm },
  source: {
    flex: 1, minHeight: 96, borderRadius: Radius.card, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: Space.sm, padding: Space.sm,
  },
  sourceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.sm, paddingRight: Space.xs,
    borderRadius: Radius.button, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  thumb: { width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: C.background },
  pdfThumb: { backgroundColor: C.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.teal },
  privacy: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', padding: Space.md, borderRadius: Radius.button, backgroundColor: C.tealSoft },
  footer: {
    paddingHorizontal: Space.screen, paddingTop: Space.md, gap: Space.sm, backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
});
