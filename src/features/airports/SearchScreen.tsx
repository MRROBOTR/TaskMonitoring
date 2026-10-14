import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Badge, Button, Empty, Input, styles as ui } from '@/components/ui';
import { NAVAID_LABELS } from '@/domain/services/navaid';
import { useAsync } from '@/hooks/useAsync';
import { referenceCounts, searchAirports, searchNavaids } from '@/infrastructure/database/referenceRepository';
import { colors } from '@/theme';

type Result =
  | { kind: 'airport'; id: string; ident: string; name: string; sub: string }
  | { kind: 'navaid'; id: string; ident: string; name: string; sub: string };

export function SearchScreen() {
  const { db, revision } = useApp();
  const [query, setQuery] = useState('');
  const counts = useAsync(() => referenceCounts(db), [db, revision]);
  const results = useAsync(async (): Promise<Result[]> => {
    if (query.trim().length < 2) return [];
    const [a, n] = await Promise.all([searchAirports(db, query, 40), searchNavaids(db, query, 20)]);
    return [
      ...a.map((x): Result => ({ kind: 'airport', id: x.id, ident: x.ident, name: x.name, sub: [x.iata, x.municipality, x.type.replace('_', ' ')].filter(Boolean).join(' · ') })),
      ...n.map((x): Result => ({ kind: 'navaid', id: x.id, ident: x.ident, name: x.name, sub: NAVAID_LABELS[x.type] })),
    ];
  }, [db, query, revision]);

  const empty = (counts.data?.airports ?? 0) === 0 && (counts.data?.navaids ?? 0) === 0;

  return (
    <View style={ui.screen}>
      <FlatList
        data={results.data ?? []}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Input testID="search-input" placeholder="ICAO / IATA / isim / navaid ident" value={query} onChangeText={setQuery} autoCapitalize="characters" autoCorrect={false} />
            <Text style={ui.dim}>
              Yerel veri: {counts.data?.airports ?? 0} airport · {counts.data?.navaids ?? 0} navaid · {counts.data?.runways ?? 0} runway
            </Text>
          </View>
        }
        ListEmptyComponent={
          empty ? (
            <Empty title="Yerel havacılık verisi yok" detail="Veri Yönetimi ekranından OurAirports verisini (Public Domain) indirin. İndirilen veri çevrimdışı kullanılabilir.">
              <Button title="Veri Yönetimi" onPress={() => router.push('/data')} />
            </Empty>
          ) : query.trim().length >= 2 && !results.loading ? (
            <Empty title="Sonuç yok" />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            testID={`search-result-${item.ident}`}
            onPress={() => router.push(item.kind === 'airport' ? `/airport/${encodeURIComponent(item.id)}` : `/navaid/${encodeURIComponent(item.id)}`)}
          >
            <Text style={styles.ident}>{item.ident}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={ui.dim} numberOfLines={1}>{item.sub}</Text>
            </View>
            <Badge label={item.kind === 'airport' ? 'Airport' : 'Navaid'} color={item.kind === 'airport' ? colors.airport : colors.vor} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, padding: 10, borderRadius: 8 },
  ident: { color: colors.text, fontFamily: 'monospace', fontWeight: '800', width: 56 },
  name: { color: colors.text, fontSize: 15 },
});
