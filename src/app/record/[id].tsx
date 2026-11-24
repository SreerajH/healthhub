import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActionSheet, Avatar, Button, ConfirmDialog, EmptyState, Icon, IconButton, RECORD_KIND, RecordsGate, Tag, TopBar, useToast,
} from '@/components/healthhub';
import { C, Radius, Shadow, Space, Type } from '@/constants/healthhub';
import { RECORD_TYPE_LABEL, type RecordFile } from '@/data/types';
import { dateLabel } from '@/lib/dates';
import { useMember, useRecord, useRecordFiles, useRemoveRecord } from '@/hooks';
import { firstName, relationLabel } from '@/lib/family';
import { downloadPdf, shareRecord } from '@/lib/share-record';
import { fileSize, isImage } from '@/lib/upload';

/** Figma "HealthHub / Record details": preview, details, notes, Share + Download PDF, ⋯ → Delete. */
function RecordDetailsScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRecord(id);
  const member = useMember(r?.memberId);
  const removeRecord = useRemoveRecord();
  const { data: attachments = [] } = useRecordFiles(id);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [viewer, setViewer] = useState<RecordFile | null>(null);
  const [working, setWorking] = useState<'share' | 'pdf' | null>(null);

  if (!r) {
    return (
      <View style={styles.flex}>
        <TopBar title="Record" />
        <View style={{ paddingTop: 64 }}>
          <EmptyState icon="Document" title="Record not found" message="It may have been deleted." badge={false}
            actionLabel="Back to records" onAction={() => router.replace('/records')} />
        </View>
      </View>
    );
  }

  const k = RECORD_KIND[r.type] ?? RECORD_KIND.other;
  const files = attachments;
  const nFiles = files.length || r.files;
  const who = member ? (member.relation === 'self' ? 'your' : `${firstName(member)}'s`) : 'their';

  const run = async (what: 'share' | 'pdf') => {
    setWorking(what);
    try {
      // the record row doesn't carry its files; hand over the ones loaded with signed URLs
      const full = { ...r, attachments: files };
      const res = what === 'share' ? await shareRecord(full, member) : await downloadPdf(full, member);
      if (res === 'unavailable') {
        toast({ message: what === 'share' ? 'Sharing isn\'t available here. Try Download PDF.' : 'PDF export isn\'t available here', type: 'error' });
      }
    } catch {
      toast({ message: what === 'share' ? 'Couldn\'t share this record. Try again.' : 'Couldn\'t make the PDF. Try again.', type: 'error' });
    } finally {
      setWorking(null);
    }
  };

  const openPdf = async (f: RecordFile) => {
    if (Platform.OS === 'web') window.open(f.uri, '_blank', 'noopener');
    else if (!(await Linking.openURL(f.uri).then(() => true, () => false))) run('share');
  };

  const doDelete = () => {
    setConfirm(false);
    removeRecord.mutate(r.id, { onError: (e) => toast({ message: e.message, type: 'error' }) });
    toast({ message: 'Record deleted' });
    if (router.canGoBack()) router.back();
    else router.replace('/records');
  };

  return (
    <View style={styles.flex}>
      <TopBar title={RECORD_TYPE_LABEL[r.type]} action={{ icon: 'More', label: 'More options', onPress: () => setMenu(true) }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Preview files={files} count={nFiles} kind={k} onOpenImage={setViewer} onOpenPdf={openPdf} />

        <View style={{ gap: Space.sm }}>
          <View style={{ flexDirection: 'row' }}>
            <Tag label={k.label} icon={k.icon} tone={k.fg === C.tealText ? 'teal' : k.fg === C.warningText ? 'amber' : 'navy'} />
          </View>
          <Text style={[Type.title, { color: C.text }]} accessibilityRole="header">{r.title}</Text>
        </View>

        <View style={styles.group}>
          <DetailRow icon="User" label="For">
            <View style={styles.forRow}>
              {member ? <Avatar name={member.name} photo={member.photo} tone={member.tone} size="S" /> : null}
              <Text style={[Type.bodyMedium, { color: C.text, flexShrink: 1 }]}>
                {member ? `${member.name} · ${relationLabel(member)}` : 'Removed member'}
              </Text>
            </View>
          </DetailRow>
          <DetailRow icon="Calendar" label="Date">{dateLabel(r.date)}</DetailRow>
          <DetailRow icon={r.type === 'lab_report' || r.type === 'scan' ? 'Flask' : 'Stethoscope'} label="Doctor or lab">
            {r.provider || 'Not added'}
          </DetailRow>
          <DetailRow icon="Paperclip" label="Files" last>{`${nFiles} file${nFiles === 1 ? '' : 's'}`}</DetailRow>
        </View>

        {r.notes ? (
          <View style={{ gap: Space.sm }}>
            <Text style={[Type.subheading, { color: C.text }]}>Notes</Text>
            <View style={styles.notes}>
              <Text style={[Type.body, { color: C.text }]}>{r.notes}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.privacy}>
          <Icon name="Lock" size={18} color={C.tealText} />
          <Text style={[Type.caption, { color: C.textSecondary, flex: 1 }]}>
            Private to your family account. Sharing sends a copy only to the people you choose.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.md }]}>
        <Button label="Share" icon="Share" variant="secondary" fill style={{ flex: 1 }} loading={working === 'share'}
          disabled={!!working} onPress={() => run('share')} />
        <Button label={nFiles ? 'Download PDF' : 'Save as PDF'} icon="Download" fill style={{ flex: 1 }} loading={working === 'pdf'}
          disabled={!!working} onPress={() => run('pdf')} />
      </View>

      <ActionSheet
        visible={menu}
        title={r.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Share', icon: 'Share', onPress: () => run('share') },
          { label: 'Download PDF', icon: 'Download', onPress: () => run('pdf') },
          { label: 'Delete record', icon: 'Trash', danger: true, onPress: () => setConfirm(true) },
        ]}
      />
      <ConfirmDialog
        visible={confirm}
        title="Delete this record?"
        message={`"${r.title}" and its ${nFiles === 1 ? 'file' : `${nFiles} files`} will be removed from ${who} records. You can't undo this.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(false)}
      />
      <ImageViewer file={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function DetailRow({ icon, label, children, last }: { icon: Parameters<typeof Icon>[0]['name']; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.detail, !last && styles.divider]}>
      <Icon name={icon} size={20} color={C.textSecondary} />
      <Text style={[Type.body, { color: C.textSecondary, width: 104 }]}>{label}</Text>
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text style={[Type.bodyMedium, { color: C.text }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** Photos as a swipeable strip, PDFs as file cards; mock records show a paper illustration. */
function Preview({
  files, count, kind, onOpenImage, onOpenPdf,
}: {
  files: RecordFile[]; count: number; kind: (typeof RECORD_KIND)[string];
  onOpenImage: (f: RecordFile) => void; onOpenPdf: (f: RecordFile) => void;
}) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 600) - Space.screen * 2;
  if (!files.length) {
    return (
      <View style={styles.paperWrap} accessibilityLabel={`${kind.label}, ${count} file${count === 1 ? '' : 's'}`}>
        <View style={styles.paper}>
          <View style={[styles.paperIcon, { backgroundColor: kind.bg }]}>
            <Icon name={kind.icon} size={24} color={kind.fg} />
          </View>
          {[0.9, 0.75, 0.82, 0.6, 0.7].map((f, i) => (
            <View key={i} style={[styles.line, { width: `${f * 100}%` }]} />
          ))}
        </View>
        <Text style={[Type.caption, { color: C.textSecondary }]}>
          {count ? `${count} file${count === 1 ? '' : 's'}` : 'No files attached · the PDF holds these details'}
        </Text>
      </View>
    );
  }
  const images = files.filter(isImage);
  const pdfs = files.filter((f) => !isImage(f));
  return (
    <View style={{ gap: Space.sm }}>
      {images.length ? (
        <ScrollView horizontal pagingEnabled={images.length > 1} showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -Space.screen, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: Space.screen, gap: Space.sm }}>
          {images.map((f, i) => (
            <Pressable key={f.id} onPress={() => onOpenImage(f)} accessibilityRole="button"
              accessibilityLabel={`Photo ${i + 1} of ${images.length}. Open full screen`}>
              <Image source={{ uri: f.uri }} style={[styles.photo, { width: images.length > 1 ? w - 32 : w }]} contentFit="cover" />
              <View style={styles.zoomHint}>
                <Icon name="Search" size={16} color={C.textInverse} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {pdfs.map((f) => (
        <Pressable key={f.id} onPress={() => onOpenPdf(f)} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`}
          style={({ pressed }) => [styles.pdf, pressed && { backgroundColor: C.background }]}>
          <View style={styles.pdfIcon}>
            <Icon name="Document" size={22} color={C.dangerText} />
            <Text style={[Type.micro, { color: C.dangerText }]}>PDF</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[Type.bodyMedium, { color: C.text }]} numberOfLines={1}>{f.name}</Text>
            <Text style={[Type.caption, { color: C.textSecondary }]}>{fileSize(f.size) || 'PDF'} · Tap to open</Text>
          </View>
          <Icon name="Chevron Right" size={20} color={C.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

function ImageViewer({ file, onClose }: { file: RecordFile | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!file} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {file ? (
          // pinch to zoom on iOS; Android and web show the photo fitted to the screen
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} maximumZoomScale={4} minimumZoomScale={1} centerContent
            showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: file.uri }} style={{ flex: 1, minHeight: 300 }} contentFit="contain" accessibilityLabel={file.name} />
          </ScrollView>
        ) : null}
        <View style={[styles.viewerBar, { top: insets.top + Space.sm }]}>
          <View style={styles.viewerClose}>
            <IconButton icon="Close" accessibilityLabel="Close photo" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.background },
  content: { padding: Space.screen, paddingBottom: Space.xxxl, gap: Space.xl, width: '100%', maxWidth: 600, alignSelf: 'center' },
  paperWrap: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.lg, borderRadius: Radius.card, backgroundColor: C.primarySoft },
  paper: {
    width: 168, height: 208, borderRadius: Radius.sm, backgroundColor: C.card, padding: Space.lg, gap: 10,
    boxShadow: Shadow.card, transform: [{ rotate: '-2deg' }],
  },
  paperIcon: { width: 40, height: 40, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  line: { height: 6, borderRadius: 3, backgroundColor: C.border },
  photo: { height: 240, borderRadius: Radius.card, backgroundColor: C.border },
  zoomHint: {
    position: 'absolute', right: Space.sm, bottom: Space.sm, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(27, 35, 51, 0.6)', alignItems: 'center', justifyContent: 'center',
  },
  pdf: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.card,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  pdfIcon: { width: 48, height: 56, borderRadius: Radius.sm, backgroundColor: C.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: C.card, borderRadius: Radius.card, paddingHorizontal: Space.lg },
  detail: { flexDirection: 'row', alignItems: 'center', gap: Space.md, minHeight: 56, paddingVertical: Space.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  forRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  notes: { backgroundColor: C.card, borderRadius: Radius.card, padding: Space.lg },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  footer: {
    flexDirection: 'row', gap: Space.md, paddingHorizontal: Space.screen, paddingTop: Space.md, backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  viewer: { flex: 1, backgroundColor: '#0B0F18' },
  viewerBar: { position: 'absolute', right: Space.sm },
  viewerClose: { borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)' },
});

/** Covered by the records lock when it is on. */
export default function RecordDetailsScreen() {
  return <RecordsGate><RecordDetailsScreenInner /></RecordsGate>;
}
