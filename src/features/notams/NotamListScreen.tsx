import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Chip, Empty, FreshnessBanner, Input, styles as ui } from '@/components/ui';
import type { NotamLifecycle } from '@/domain/models/notam';
import { LIFECYCLE_LABELS } from '@/domain/notam/lifecycle';
import { CATEGORY_LABELS, type NotamCategory } from '@/domain/notam/qcodes';
import { colors } from '@/theme';
import { filterNotams, type EvaluatedNotam } from './notamData';
import { useNotams } from './useNotams';

const ALL_STATES: NotamLifecycle[] = ['active', 'future', 'unknown', 'expired', 'replaced', 'cancelled'];
const ALL_CATS = Object.keys(CATEGORY_LABELS) as NotamCategory[];

export const LIFECYCLE_COLORS: Record<NotamLifecycle, string> = {
  active: colors.danger,
  future: colors.caution,
  unknown: colors.warning,
  expired: colors.textDim,
  replaced: colors.textDim,
  cancelled: colors.textDim,
};

export function NotamListScreen() {
  const { evaluated, freshness, loading } = useNotams();
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [states, setStates] = useState<Set<NotamLifecycle>>(new Set(['active', 'future', 'unknown']));
  const [cats, setCats] = useState<Set<NotamCategory>>(new Set(ALL_CATS));
  const [reviewOnly, setReviewOnly] = useState(false);

  const items = useMemo(
    () => filterNotams(evaluated, { text, location, states, categories: cats, needsReviewOnly: reviewOnly }),
    [evaluated, text, location, states, cats, reviewOnly],
  );
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    apply(n);
  };

  return (
    <View style={ui.screen}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.notam.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <FreshnessBanner state={freshness.state} source={freshness.source} lastSuccessAt={freshness.lastSuccessAt} detail="Canlı NOTAM sağlayıcısı yetkilendirilmedi; veriler yalnızca içe aktarılan mesajlardır." />
            <Button title="NOTAM içe aktar (yapıştır / dosya)" onPress={() => router.push('/notam-import')} testID="notam-import-button" />
            <Input placeholder="Metin veya NOTAM no ara" value={text} onChangeText={setText} autoCapitalize="characters" />
            <Input placeholder="FIR / meydan (ör. LTAA, LTFM)" value={location} onChangeText={setLocation} autoCapitalize="characters" maxLength={4} />
            <View style={ui.wrap}>
              {ALL_STATES.map((s) => (
                <Chip key={s} label={LIFECYCLE_LABELS[s]} active={states.has(s)} color={LIFECYCLE_COLORS[s]} onPress={() => toggle(states, s, setStates)} />
              ))}
            </View>
            <View style={ui.wrap}>
              {ALL_CATS.map((c) => (
                <Chip key={c} label={CATEGORY_LABELS[c]} active={cats.has(c)} onPress={() => toggle(cats, c, setCats)} />
              ))}
              <Chip label="Yalnızca inceleme gerekenler" active={reviewOnly} color={colors.warning} onPress={() => setReviewOnly((v) => !v)} />
            </View>
            <Text style={ui.dim}>{items.length} / {evaluated.length} NOTAM</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Empty
              title="NOTAM yok"
              detail={evaluated.length === 0 ? 'Henüz NOTAM içe aktarılmadı. Resmi brifing kaynağınızdan aldığınız ICAO formatındaki NOTAM metnini içe aktarın.' : 'Filtrelerle eşleşen NOTAM yok.'}
            />
          )
        }
        renderItem={({ item }) => <NotamRow item={item} />}
      />
    </View>
  );
}

function NotamRow({ item }: { item: EvaluatedNotam }) {
  const { notam: n, life } = item;
  return (
    <Pressable
      testID={`notam-row-${n.displayId ?? n.id}`}
      onPress={() => router.push(`/notam/${encodeURIComponent(n.id)}`)}
      style={[styles.row, life.state === 'active' && styles.activeRow]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.id}>{n.displayId ?? 'Tanımsız'}</Text>
        <Text style={styles.loc}>{[n.q?.fir, ...n.locations].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={ui.wrap}>
        <Badge label={LIFECYCLE_LABELS[life.state]} color={LIFECYCLE_COLORS[life.state]} />
        {n.type !== 'NEW' ? <Badge label={`NOTAM${n.type[0]}`} color={colors.accent} /> : null}
        {n.provenance.origin === 'synthetic' ? <Badge label="SİMÜLE" color={colors.synthetic} /> : null}
        {n.provenance.origin === 'manual-import' ? <Badge label="MANUEL" color={colors.manual} /> : null}
        {n.geometry ? (
          <Badge label={n.geometry.confidence === 'confirmed' ? 'Geometri ✓' : 'Geometri ≈'} color={n.geometry.confidence === 'confirmed' ? colors.notamConfirmed : colors.notamApprox} />
        ) : (
          <Badge label="Haritada yok" color={colors.textDim} />
        )}
        {n.parseStatus === 'needs-review' || n.parseStatus === 'failed' ? <Badge label="İNCELE" color={colors.warning} /> : null}
      </View>
      <Text style={styles.text} numberOfLines={3}>{n.text || n.raw}</Text>
      <Text style={styles.time}>
        {n.validFrom.iso?.slice(0, 16).replace('T', ' ') ?? '?'}Z → {n.validTo.permanent ? 'PERM' : `${n.validTo.iso?.slice(0, 16).replace('T', ' ') ?? '?'}Z${n.validTo.estimated ? ' EST' : ''}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderRadius: 8, padding: 10, gap: 6, borderWidth: 1, borderColor: colors.border },
  activeRow: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  id: { color: colors.text, fontWeight: '800', fontFamily: 'monospace' },
  loc: { color: colors.textDim, fontFamily: 'monospace' },
  text: { color: colors.text, fontFamily: 'monospace', fontSize: 13 },
  time: { color: colors.textDim, fontSize: 12, fontFamily: 'monospace' },
});
