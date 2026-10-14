import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Button, Chip, Empty, Input, styles as ui } from '@/components/ui';
import { CATEGORY_LABELS, DOCUMENT_CATEGORIES, type DocumentCategory, type StoredDocument } from '@/domain/models/document';
import { formatBytes } from '@/domain/services/documentValidation';
import { useAsync } from '@/hooks/useAsync';
import { listDocuments, recentDocuments, updateDocumentMeta } from '@/infrastructure/database/documentRepository';
import { deleteStoredDocument, documentExists, pickAndImportPdf } from '@/infrastructure/filesystem/documentStorage';
import { colors } from '@/theme';
import { RenameDialog } from './RenameDialog';

export function DocumentsScreen() {
  const { db, revision, bumpRevision } = useApp();
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<StoredDocument | null>(null);

  const docs = useAsync(
    () => listDocuments(db, { category: category ?? undefined, favoritesOnly, query }),
    [db, category, favoritesOnly, query, revision],
  );
  const recent = useAsync(() => recentDocuments(db, 5), [db, revision]);

  const importPdf = async () => {
    const target = category ?? 'user';
    try {
      const res = await pickAndImportPdf(db, target, (stage) =>
        setBusy(stage === 'validating' ? 'Doğrulanıyor…' : stage === 'copying' ? 'Kopyalanıyor…' : 'Kaydediliyor…'),
      );
      if (res.status === 'imported') bumpRevision();
      else if (res.status === 'duplicate') Alert.alert('Zaten içe aktarılmış', `Aynı dosya "${res.existing.title}" olarak kayıtlı.`);
      else if (res.status === 'invalid') Alert.alert('Geçersiz dosya', res.message);
    } catch (e) {
      Alert.alert('İçe aktarma hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const actions = (d: StoredDocument) => {
    const opts = ['Favori ' + (d.favorite ? 'kaldır' : 'ekle'), 'Yeniden adlandır', 'Kategori değiştir', 'Sil', 'Vazgeç'];
    const handle = async (i: number) => {
      const now = new Date().toISOString();
      if (i === 0) await updateDocumentMeta(db, d.id, { favorite: !d.favorite }, now);
      if (i === 1) setRenaming(d);
      if (i === 2) {
        const idx = (DOCUMENT_CATEGORIES.indexOf(d.category) + 1) % DOCUMENT_CATEGORIES.length;
        await updateDocumentMeta(db, d.id, { category: DOCUMENT_CATEGORIES[idx] }, now);
      }
      if (i === 3) {
        Alert.alert('Silinsin mi?', `"${d.title}" cihazdan kalıcı olarak silinecek.`, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Sil', style: 'destructive', onPress: async () => { await deleteStoredDocument(db, d); bumpRevision(); } },
        ]);
      }
      bumpRevision();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: opts, destructiveButtonIndex: 3, cancelButtonIndex: 4 }, (i) => void handle(i));
    } else {
      Alert.alert(d.title, undefined, [
        { text: opts[0]!, onPress: () => void handle(0) },
        { text: opts[1]!, onPress: () => void handle(1) },
        { text: `Kategori: ${CATEGORY_LABELS[d.category]} → sonraki`, onPress: () => void handle(2) },
        { text: opts[3]!, style: 'destructive', onPress: () => void handle(3) },
        { text: 'Vazgeç', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={ui.screen}>
      <FlatList
        data={docs.data ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Button title={busy ?? `PDF içe aktar (${CATEGORY_LABELS[category ?? 'user']})`} disabled={!!busy} onPress={importPdf} testID="import-pdf-button" />
            <Button title="Acil durum dokümanları" kind="danger" onPress={() => router.push('/emergency')} />
            <Input placeholder="Doküman ara" value={query} onChangeText={setQuery} />
            <View style={ui.wrap}>
              <Chip label="Tümü" active={category === null} onPress={() => setCategory(null)} />
              {DOCUMENT_CATEGORIES.map((c) => (
                <Chip key={c} label={CATEGORY_LABELS[c]} active={category === c} onPress={() => setCategory(c)} />
              ))}
              <Chip label="★ Favoriler" active={favoritesOnly} color={colors.caution} onPress={() => setFavoritesOnly((v) => !v)} />
            </View>
            {recent.data && recent.data.length > 0 && !query && !category ? (
              <View style={{ gap: 4 }}>
                <Text style={styles.section}>Son açılanlar</Text>
                {recent.data.map((d) => (
                  <Pressable key={d.id} onPress={() => router.push(`/document/${d.id}`)}>
                    <Text style={styles.recent} numberOfLines={1}>{d.title} {d.lastPage ? `· s.${d.lastPage}` : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.section}>Doküman kütüphanesi</Text>
          </View>
        }
        ListEmptyComponent={docs.loading ? null : <Empty title="Doküman yok" detail="Cihazınızdaki PDF dosyalarını içe aktarın. Dosyalar uygulamanın özel depolama alanına kopyalanır ve internet olmadan açılabilir." />}
        renderItem={({ item: d }) => {
          const missing = !documentExists(d);
          return (
            <Pressable testID={`doc-row-${d.id}`} style={styles.row} onPress={() => router.push(`/document/${d.id}`)} onLongPress={() => actions(d)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>{d.favorite ? '★ ' : ''}{d.title}</Text>
                <Text style={ui.dim}>{CATEGORY_LABELS[d.category]} · {formatBytes(d.fileSize)} · {d.importedAt.slice(0, 10)}</Text>
                {missing ? <Text style={{ color: colors.danger }}>Dosya bulunamadı (depolama hatası)</Text> : null}
              </View>
              <Pressable onPress={() => actions(d)} hitSlop={10} accessibilityLabel="İşlemler">
                <Text style={styles.more}>⋯</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
      {renaming ? (
        <RenameDialog
          initial={renaming.title}
          onCancel={() => setRenaming(null)}
          onSave={async (t) => {
            await updateDocumentMeta(db, renaming.id, { title: t }, new Date().toISOString());
            setRenaming(null);
            bumpRevision();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, padding: 10, borderRadius: 8 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  more: { color: colors.text, fontSize: 22, paddingHorizontal: 6 },
  section: { color: colors.accent, fontWeight: '700', marginTop: 6 },
  recent: { color: colors.text, paddingVertical: 2 },
});
