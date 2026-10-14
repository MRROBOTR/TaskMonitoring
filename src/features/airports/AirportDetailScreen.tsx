import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Badge, Body, Button, Card, Disclaimer, Empty, H1, H2, Row, Screen, styles as ui } from '@/components/ui';
import { LIFECYCLE_LABELS } from '@/domain/notam/lifecycle';
import { formatLatLon } from '@/domain/services/geo';
import { useAsync } from '@/hooks/useAsync';
import { getAirport, getNavaid } from '@/infrastructure/database/referenceRepository';
import { formatNavaidFrequency, hasDme, NAVAID_LABELS } from '@/domain/services/navaid';
import { useNotams } from '@/features/notams/useNotams';
import { LIFECYCLE_COLORS } from '@/features/notams/NotamListScreen';
import { colors } from '@/theme';

export function AirportDetailScreen({ id }: { id: string }) {
  const { db, revision } = useApp();
  const q = useAsync(() => getAirport(db, id), [db, id, revision]);
  const { evaluated } = useNotams();
  if (!q.data) return <Screen>{q.loading ? null : <Empty title="Airport bulunamadı" />}</Screen>;
  const { airport: a, runways } = q.data;
  const related = evaluated.filter((e) => e.notam.locations.includes(a.ident) || (a.icao && e.notam.locations.includes(a.icao)));

  return (
    <Screen>
      <H1>{a.ident} · {a.name}</H1>
      <Card>
        <Row label="ICAO / IATA / Local" value={`${a.icao ?? '—'} / ${a.iata ?? '—'} / ${a.localCode ?? '—'}`} mono />
        <Row label="Tip" value={a.type.replace('_', ' ')} />
        <Row label="Koordinat (WGS-84)" value={formatLatLon(a.position)} mono />
        <Row label="Elevation" value={a.elevationFt !== null ? `${a.elevationFt} ft` : null} />
        <Row label="Ülke / Bölge" value={`${a.country ?? '—'} / ${a.region ?? '—'}`} />
        <Row label="Şehir" value={a.municipality} />
        <Button title="Haritada göster" kind="secondary" onPress={() => router.push({ pathname: '/', params: { lat: String(a.position.lat), lon: String(a.position.lon), zoom: '12' } })} />
      </Card>

      <Card>
        <H2>Runways ({runways.length})</H2>
        {runways.length === 0 ? <Body dim>Kaynakta pist kaydı yok.</Body> : null}
        {runways.map((r) => (
          <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontFamily: 'monospace' }}>
              {r.le.ident ?? '?'}/{r.he.ident ?? '?'} {r.closed ? '(CLOSED)' : ''}
            </Text>
            <Row label="Boyut" value={`${r.lengthFt ?? '?'} × ${r.widthFt ?? '?'} ft`} />
            <Row label="Yüzey (kaynak kodu)" value={r.surface} />
            <Row label="Işıklandırma" value={r.lighted === null ? null : r.lighted ? 'Evet' : 'Hayır'} />
            <Row label="Heading (true)" value={`${r.le.headingTrueDeg ?? '—'}° / ${r.he.headingTrueDeg ?? '—'}°`} />
            <Row label="Displaced thr." value={`${r.le.displacedThresholdFt ?? '—'} / ${r.he.displacedThresholdFt ?? '—'} ft`} />
          </View>
        ))}
      </Card>

      <Card>
        <H2>Frequencies</H2>
        {a.frequencies.length === 0 ? <Body dim>Kaynakta frekans kaydı yok.</Body> : null}
        {a.frequencies.map((f, i) => (
          <Row key={i} label={`${f.type}${f.description ? ` · ${f.description}` : ''}`} value={`${f.mhz.toFixed(3)} MHz`} mono />
        ))}
      </Card>

      <Card>
        <H2>İlgili NOTAM&apos;lar</H2>
        <Body dim>A) maddesinde bu meydanı içeren içe aktarılmış NOTAM&apos;lar. FIR geneli veya başka konumlu NOTAM&apos;lar da bu meydanı etkileyebilir.</Body>
        {related.length === 0 ? <Body dim>Yok.</Body> : null}
        {related.map((e) => (
          <Pressable key={e.notam.id} onPress={() => router.push(`/notam/${encodeURIComponent(e.notam.id)}`)} style={{ gap: 2, paddingVertical: 4 }}>
            <View style={ui.wrap}>
              <Text style={{ color: colors.text, fontFamily: 'monospace', fontWeight: '700' }}>{e.notam.displayId}</Text>
              <Badge label={LIFECYCLE_LABELS[e.life.state]} color={LIFECYCLE_COLORS[e.life.state]} />
            </View>
            <Text style={{ color: colors.textDim }} numberOfLines={2}>{e.notam.text}</Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <H2>Kaynak</H2>
        <Row label="Sağlayıcı" value={a.provenance.sourceId} />
        <Row label="Kaynak kayıt no" value={a.provenance.sourceRecordId} mono />
        <Row label="Alınma" value={a.provenance.retrievedAt} mono />
      </Card>
      <Disclaimer />
    </Screen>
  );
}

export function NavaidDetailScreen({ id }: { id: string }) {
  const { db, revision } = useApp();
  const q = useAsync(() => getNavaid(db, id), [db, id, revision]);
  if (!q.data) return <Screen>{q.loading ? null : <Empty title="Navaid bulunamadı" />}</Screen>;
  const n = q.data;
  return (
    <Screen>
      <H1>{n.ident} · {n.name}</H1>
      <Card>
        <Row label="Tip" value={`${NAVAID_LABELS[n.type]} (kaynak: ${n.sourceType || '—'})`} />
        <Row label="Frekans" value={formatNavaidFrequency(n.type, n.frequencyKhz)} mono />
        <Row label="DME" value={hasDme(n.type) ? `Var${n.dmeChannel ? ` · CH ${n.dmeChannel}` : ''}` : 'Kaynak tipine göre yok'} />
        <Row label="Koordinat (WGS-84)" value={formatLatLon(n.position)} mono />
        <Row label="Elevation" value={n.elevationFt !== null ? `${n.elevationFt} ft` : null} />
        <Row label="Magnetic var." value={n.magneticVariationDeg !== null ? `${n.magneticVariationDeg}°` : null} />
        <Row label="Kullanım / Güç" value={`${n.usage ?? '—'} / ${n.power ?? '—'}`} />
        <Row label="İlişkili meydan" value={n.associatedAirport} mono />
        <Button title="Haritada göster" kind="secondary" onPress={() => router.push({ pathname: '/', params: { lat: String(n.position.lat), lon: String(n.position.lon), zoom: '10' } })} />
      </Card>
      <Card>
        <H2>Kaynak</H2>
        <Row label="Sağlayıcı" value={n.provenance.sourceId} />
        <Row label="Kaynak kayıt no" value={n.provenance.sourceRecordId} mono />
        <Row label="Alınma" value={n.provenance.retrievedAt} mono />
      </Card>
      <Disclaimer />
    </Screen>
  );
}
