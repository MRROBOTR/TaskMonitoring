import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Body, Empty, H1, Screen } from '@/components/ui';
import { CATEGORY_LABELS, EMERGENCY_CATEGORIES } from '@/domain/models/document';
import { useAsync } from '@/hooks/useAsync';
import { listDocuments } from '@/infrastructure/database/documentRepository';
import { colors } from '@/theme';

/** One-tap access to emergency procedures, QRH and checklists (offline). */
export function EmergencyScreen() {
  const { db, revision } = useApp();
  const docs = useAsync(() => listDocuments(db, { category: EMERGENCY_CATEGORIES }), [db, revision]);
  return (
    <Screen>
      <H1>Acil durum erişimi</H1>
      <Body dim>Acil durum prosedürleri, QRH ve checklist kategorisindeki dokümanlar. Tamamı cihazda saklanır.</Body>
      {(docs.data ?? []).length === 0 && !docs.loading ? (
        <Empty title="Doküman yok" detail="Dokümanlar ekranından QRH / acil durum PDF'lerinizi bu kategorilere içe aktarın." />
      ) : null}
      {(docs.data ?? []).map((d) => (
        <Pressable
          key={d.id}
          onPress={() => router.push(`/document/${d.id}`)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#5A1616' : '#3A1010',
            borderColor: colors.danger,
            borderWidth: 2,
            borderRadius: 10,
            padding: 18,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{d.title}</Text>
          <Text style={{ color: colors.textDim }}>{CATEGORY_LABELS[d.category]}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
