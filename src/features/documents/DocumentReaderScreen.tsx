/**
 * PDF reader (react-native-pdf, MIT). Renders the app-private local copy, so
 * it works offline. Text search is not provided by the library and is not
 * offered; scanned PDFs would require OCR anyway.
 */
import * as Crypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import Pdf from 'react-native-pdf';
import { useApp } from '@/app-state/AppContext';
import { Empty, Screen } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { addBookmark, deleteBookmark, getDocument, listBookmarks, markOpened } from '@/infrastructure/database/documentRepository';
import { documentExists, fileForDocument } from '@/infrastructure/filesystem/documentStorage';
import { colors } from '@/theme';

export function DocumentReaderScreen({ id }: { id: string }) {
  const { db, bumpRevision } = useApp();
  const doc = useAsync(() => getDocument(db, id), [db, id]);
  const [bmRev, setBmRev] = useState(0);
  const bookmarks = useAsync(() => listBookmarks(db, id), [db, id, bmRev]);
  const [page, setPage] = useState(1);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
  const [pages, setPages] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jump, setJump] = useState('');
  const lastSaved = useRef(0);

  const loaded = !!doc.data;
  useEffect(() => {
    if (loaded) void markOpened(db, id, new Date().toISOString(), null).then(bumpRevision);
  }, [loaded, db, id, bumpRevision]);

  // Persist reading position (throttled).
  useEffect(() => {
    if (!doc.data || page === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = page;
      void markOpened(db, id, new Date().toISOString(), page);
    }, 1500);
    return () => clearTimeout(t);
  }, [page, doc.data, db, id]);

  if (!doc.data) return <Screen>{doc.loading ? null : <Empty title="Doküman bulunamadı" />}</Screen>;
  const d = doc.data;
  if (!documentExists(d)) {
    return <Screen><Empty title="Dosya bulunamadı" detail="Doküman kaydı var ancak dosya uygulama deposunda yok. Dokümanı silip yeniden içe aktarın." /></Screen>;
  }
  const uri = fileForDocument(d).uri;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: d.title, headerShown: !fullScreen }} />
      <StatusBar hidden={fullScreen} />
      {error ? (
        <Empty title="PDF açılamadı" detail={`Dosya bozuk veya desteklenmiyor olabilir.\n${error}`} />
      ) : (
        <Pdf
          source={{ uri }}
          page={targetPage ?? d.lastPage ?? 1}
          style={styles.pdf}
          enableDoubleTapZoom
          enableAnnotationRendering={false}
          trustAllCerts={false}
          onLoadComplete={(n) => setPages(n)}
          onPageChanged={(p, n) => {
            setPage(p);
            setPages(n);
          }}
          onError={(e) => setError(String((e as { message?: string })?.message ?? e))}
          onPressLink={() => {
            /* Links inside PDFs are not opened automatically (untrusted content). */
          }}
          onPageSingleTap={() => setFullScreen((f) => !f)}
        />
      )}
      {!fullScreen ? (
        <View style={styles.toolbar}>
          <ToolButton label="◀" onPress={() => setTargetPage(Math.max(1, page - 1))} />
          <Text style={styles.pageText} testID="pdf-page">{page} / {pages || '?'}</Text>
          <ToolButton label="▶" onPress={() => setTargetPage(Math.min(pages || page + 1, page + 1))} />
          <TextInput
            style={styles.jump}
            value={jump}
            onChangeText={setJump}
            keyboardType="number-pad"
            placeholder="Sayfa"
            placeholderTextColor={colors.textDim}
            onSubmitEditing={() => {
              const n = Number(jump);
              if (n >= 1 && (!pages || n <= pages)) setTargetPage(n);
              setJump('');
            }}
          />
          <ToolButton
            label="＋🔖"
            onPress={async () => {
              await addBookmark(db, { id: Crypto.randomUUID(), documentId: id, page, label: `Sayfa ${page}`, createdAt: new Date().toISOString() });
              setBmRev((r) => r + 1);
            }}
          />
          <ToolButton label={`🔖${bookmarks.data?.length ?? 0}`} onPress={() => setShowBookmarks((s) => !s)} />
          <ToolButton label="⛶" onPress={() => setFullScreen(true)} />
        </View>
      ) : null}
      {showBookmarks && !fullScreen ? (
        <View style={styles.bookmarks}>
          {(bookmarks.data ?? []).length === 0 ? <Text style={styles.dim}>Yer imi yok</Text> : null}
          {(bookmarks.data ?? []).map((b) => (
            <View key={b.id} style={styles.bmRow}>
              <Pressable style={{ flex: 1 }} onPress={() => { setTargetPage(b.page); setShowBookmarks(false); }}>
                <Text style={styles.bmText}>{b.label}</Text>
              </Pressable>
              <Pressable onPress={async () => { await deleteBookmark(db, b.id); setBmRev((r) => r + 1); }}>
                <Text style={{ color: colors.danger }}>Sil</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ToolButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tb, pressed && { opacity: 0.6 }]}>
      <Text style={styles.tbText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  pdf: { flex: 1, backgroundColor: '#222' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  pageText: { color: colors.text, fontFamily: 'monospace', minWidth: 64, textAlign: 'center' },
  jump: { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, width: 60 },
  tb: { paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.surfaceAlt, borderRadius: 6 },
  tbText: { color: colors.text, fontWeight: '700' },
  bookmarks: { position: 'absolute', right: 8, bottom: 60, width: 220, maxHeight: 300, backgroundColor: colors.surface, borderRadius: 8, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.border },
  bmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bmText: { color: colors.text },
  dim: { color: colors.textDim },
});
