import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Body, Button, Card, Chip, Disclaimer, H1, H2, Input, Screen, styles as ui } from '@/components/ui';
import { computeRoute, formatCourse, formatEte, type RoutePoint } from '@/domain/services/route';
import { useAsync } from '@/hooks/useAsync';
import { deleteRoute, listRoutes, saveRoute, type SavedRoute } from '@/infrastructure/database/appRepository';
import { searchAirports, searchNavaids } from '@/infrastructure/database/referenceRepository';
import { colors } from '@/theme';

function parseNum(s: string): number | null {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
}

export function RoutePlannerScreen() {
  const { db, revision, bumpRevision, settings, updateSettings } = useApp();
  const [routeId, setRouteId] = useState<string>(() => Crypto.randomUUID());
  const [name, setName] = useState('Yeni rota');
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [gs, setGs] = useState('110');
  const [variation, setVariation] = useState('');
  const [query, setQuery] = useState('');

  const saved = useAsync(() => listRoutes(db), [db, revision]);
  const results = useAsync(async () => {
    if (query.trim().length < 2) return [];
    const [a, n] = await Promise.all([searchAirports(db, query, 8), searchNavaids(db, query, 6)]);
    return [
      ...a.map((x): RoutePoint => ({ id: '', ident: x.ident, name: x.name, kind: 'airport', refId: x.id, position: x.position })),
      ...n.map((x): RoutePoint => ({ id: '', ident: x.ident, name: `${x.name} (${x.type})`, kind: 'navaid', refId: x.id, position: x.position })),
    ];
  }, [db, query]);

  const summary = useMemo(() => computeRoute(points, parseNum(gs), parseNum(variation)), [points, gs, variation]);

  const add = (p: RoutePoint) => {
    setPoints((ps) => [...ps, { ...p, id: Crypto.randomUUID() }]);
    setQuery('');
  };
  const move = (i: number, d: -1 | 1) =>
    setPoints((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const n = [...ps];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const persist = async (activate: boolean) => {
    if (points.length < 2) {
      Alert.alert('En az iki nokta gerekli');
      return;
    }
    const now = new Date().toISOString();
    const existing = saved.data?.find((r) => r.id === routeId);
    await saveRoute(db, {
      id: routeId,
      name: name.trim() || 'Rota',
      groundSpeedKt: parseNum(gs),
      variationDeg: parseNum(variation),
      createdAt: existing?.createdAt ?? now,
      modifiedAt: now,
      points,
    });
    if (activate) await updateSettings({ activeRouteId: routeId });
    bumpRevision();
    if (activate) router.push('/');
  };

  const load = (r: SavedRoute) => {
    setRouteId(r.id);
    setName(r.name);
    setPoints(r.points);
    setGs(r.groundSpeedKt?.toString() ?? '');
    setVariation(r.variationDeg?.toString() ?? '');
  };

  return (
    <Screen>
      <H1>Flight Planning</H1>
      <Body dim>
        Kullanıcı tanımlı doğrudan (great-circle) bacaklar. Airway yönlendirmesi veya ATC rotası doğrulaması yapılmaz.
      </Body>
      <Card>
        <Input value={name} onChangeText={setName} placeholder="Rota adı" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={ui.dim}>Ground speed (kt)</Text>
            <Input value={gs} onChangeText={setGs} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui.dim}>Mag. var. (°, Doğu +)</Text>
            <Input value={variation} onChangeText={setVariation} keyboardType="numbers-and-punctuation" placeholder="bilinmiyor" />
          </View>
        </View>
        <Input value={query} onChangeText={setQuery} placeholder="Nokta ekle: airport / navaid ara" autoCapitalize="characters" testID="route-search" />
        {(results.data ?? []).map((r) => (
          <Pressable key={`${r.kind}-${r.refId}`} onPress={() => add(r)} style={styles.result}>
            <Text style={styles.ident}>{r.ident}</Text>
            <Text style={ui.dim} numberOfLines={1}>{r.name}</Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <H2>Bacaklar</H2>
        {points.length === 0 ? <Body dim>Henüz nokta yok.</Body> : null}
        {points.map((p, i) => (
          <View key={p.id} style={styles.pointRow}>
            <Text style={styles.ident}>{i + 1}. {p.ident}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip label="↑" onPress={() => move(i, -1)} />
              <Chip label="↓" onPress={() => move(i, 1)} />
              <Chip label="✕" onPress={() => setPoints((ps) => ps.filter((x) => x.id !== p.id))} />
            </View>
          </View>
        ))}
        {summary.legs.map((l, i) => (
          <View key={i} style={styles.leg}>
            <Text style={styles.legText}>
              {l.from.ident} → {l.to.ident}: {l.distanceNm.toFixed(1)} NM · TC {formatCourse(l.trueCourseDeg)}°
              {l.magneticCourseDeg !== null ? ` · MC ${formatCourse(l.magneticCourseDeg)}°` : ''} · ETE {formatEte(l.eteMin)}
            </Text>
          </View>
        ))}
        {summary.legs.length > 0 ? (
          <Text style={[styles.legText, { fontWeight: '800' }]} testID="route-total">
            Toplam: {summary.totalNm.toFixed(1)} NM · ETE {formatEte(summary.totalEteMin)} (rüzgarsız)
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Kaydet" onPress={() => persist(false)} />
          <Button title="Kaydet ve haritada göster" kind="secondary" onPress={() => persist(true)} />
          <Button
            title="Yeni"
            kind="secondary"
            onPress={() => {
              setRouteId(Crypto.randomUUID());
              setName('Yeni rota');
              setPoints([]);
            }}
          />
        </View>
      </Card>

      <Card>
        <H2>Kayıtlı rotalar</H2>
        {(saved.data ?? []).length === 0 ? <Body dim>Yok.</Body> : null}
        {(saved.data ?? []).map((r) => (
          <View key={r.id} style={styles.pointRow}>
            <Pressable style={{ flex: 1 }} onPress={() => load(r)}>
              <Text style={{ color: colors.text }}>
                {settings.activeRouteId === r.id ? '● ' : ''}
                {r.name} · {r.points.map((p) => p.ident).join(' ')}
              </Text>
            </Pressable>
            <Chip
              label="Sil"
              onPress={async () => {
                await deleteRoute(db, r.id);
                if (settings.activeRouteId === r.id) await updateSettings({ activeRouteId: null });
                bumpRevision();
              }}
            />
          </View>
        ))}
      </Card>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  ident: { color: colors.text, fontFamily: 'monospace', fontWeight: '800', minWidth: 60 },
  pointRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  leg: { paddingVertical: 2 },
  legText: { color: colors.text, fontFamily: 'monospace', fontSize: 13 },
});
