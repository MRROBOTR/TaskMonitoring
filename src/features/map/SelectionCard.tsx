import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Badge } from '@/components/ui';
import { LIFECYCLE_LABELS } from '@/domain/notam/lifecycle';
import { formatLatLon } from '@/domain/services/geo';
import { formatNavaidFrequency, hasDme, NAVAID_LABELS } from '@/domain/services/navaid';
import { useAsync } from '@/hooks/useAsync';
import { getNotam } from '@/infrastructure/database/notamRepository';
import { getAirport, getNavaid } from '@/infrastructure/database/referenceRepository';
import { useNotams } from '@/features/notams/useNotams';
import { colors } from '@/theme';

export type Selection = { kind: 'airport' | 'navaid' | 'notam'; id: string };

export function SelectionCard({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { db } = useApp();
  const { evaluated } = useNotams();
  const q = useAsync(async () => {
    if (selection.kind === 'airport') return { airport: await getAirport(db, selection.id) };
    if (selection.kind === 'navaid') return { navaid: await getNavaid(db, selection.id) };
    return { notam: await getNotam(db, selection.id) };
  }, [db, selection.kind, selection.id]);

  let title = '…';
  let lines: string[] = [];
  let badge: { label: string; color: string } | null = null;
  let href = '';
  const d = q.data;
  if (d && 'airport' in d && d.airport) {
    const a = d.airport.airport;
    title = `${a.ident} · ${a.name}`;
    lines = [
      formatLatLon(a.position),
      `Elev: ${a.elevationFt ?? '—'} ft · Runways: ${d.airport.runways.length}`,
      `Kaynak: ${a.provenance.sourceId} · ${a.provenance.retrievedAt.slice(0, 10)}`,
    ];
    href = `/airport/${encodeURIComponent(a.id)}`;
  } else if (d && 'navaid' in d && d.navaid) {
    const n = d.navaid;
    title = `${n.ident} · ${n.name}`;
    badge = { label: NAVAID_LABELS[n.type], color: colors.vor };
    lines = [
      `${formatNavaidFrequency(n.type, n.frequencyKhz) ?? 'Frekans yok'}${hasDme(n.type) ? ` · DME ${n.dmeChannel ?? ''}` : ''}`,
      formatLatLon(n.position),
      `Kaynak: ${n.provenance.sourceId} · ${n.provenance.retrievedAt.slice(0, 10)}`,
    ];
    href = `/navaid/${encodeURIComponent(n.id)}`;
  } else if (d && 'notam' in d && d.notam) {
    const n = d.notam;
    const life = evaluated.find((e) => e.notam.id === n.id)?.life;
    title = `NOTAM ${n.displayId ?? '(tanımsız)'}`;
    badge = life ? { label: LIFECYCLE_LABELS[life.state], color: life.state === 'active' ? colors.danger : colors.caution } : null;
    lines = [
      n.text.slice(0, 160),
      `Geometri: ${n.geometry?.confidence === 'confirmed' ? 'doğrulandı (metin)' : 'yaklaşık (Q satırı)'}`,
      `Kaynak: ${n.provenance.origin === 'manual-import' ? 'Manuel içe aktarım' : n.provenance.origin === 'synthetic' ? 'SİMÜLE' : n.provenance.sourceId}`,
    ];
    href = `/notam/${encodeURIComponent(n.id)}`;
  } else if (!q.loading) {
    title = 'Kayıt bulunamadı';
  }

  return (
    <View style={[styles.card, selection.kind === 'notam' && styles.notamCard]} testID="selection-card">
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onClose} accessibilityLabel="Kapat"><Text style={styles.close}>✕</Text></Pressable>
      </View>
      {badge ? <Badge label={badge.label} color={badge.color} /> : null}
      {lines.map((l, i) => (
        <Text key={i} style={styles.line} numberOfLines={3}>{l}</Text>
      ))}
      {href ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(href as never)} style={styles.more}>
          <Text style={styles.moreText}>Detaylar ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 8, right: 8, bottom: 70, backgroundColor: 'rgba(19,28,46,0.97)', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  notamCard: { borderColor: colors.notamConfirmed, borderWidth: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 },
  close: { color: colors.text, fontSize: 18, paddingHorizontal: 6 },
  line: { color: colors.textDim, fontSize: 13 },
  more: { alignSelf: 'flex-end', paddingVertical: 4 },
  moreText: { color: colors.accent, fontWeight: '700' },
});
