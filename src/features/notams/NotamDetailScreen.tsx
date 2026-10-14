import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Badge, Body, Button, Card, Disclaimer, Empty, H1, H2, Row, Screen, styles as ui } from '@/components/ui';
import { LIFECYCLE_LABELS } from '@/domain/notam/lifecycle';
import { qCodeGroup } from '@/domain/notam/qcodes';
import { formatLatLon } from '@/domain/services/geo';
import { formatVerticalLimit } from '@/domain/services/verticalLimits';
import { colors } from '@/theme';
import { LIFECYCLE_COLORS } from './NotamListScreen';
import { useNotams } from './useNotams';

const ORIGIN_LABELS = {
  provider: 'Sağlayıcı',
  'manual-import': 'Manuel içe aktarım (doğrulanmadı)',
  synthetic: 'SİMÜLE TEST VERİSİ',
  user: 'Kullanıcı',
} as const;

export function NotamDetailScreen({ id }: { id: string }) {
  const { evaluated, loading } = useNotams();
  const item = evaluated.find((e) => e.notam.id === id);
  if (!item) return <Screen>{loading ? null : <Empty title="NOTAM bulunamadı" />}</Screen>;
  const { notam: n, life } = item;
  const centre = n.geometry?.centre ?? n.q?.centre ?? null;

  return (
    <Screen>
      <H1>NOTAM {n.displayId ?? '(tanımsız)'}</H1>
      <View style={ui.wrap}>
        <Badge label={LIFECYCLE_LABELS[life.state]} color={LIFECYCLE_COLORS[life.state]} />
        <Badge label={ORIGIN_LABELS[n.provenance.origin]} color={n.provenance.origin === 'synthetic' ? colors.synthetic : colors.manual} />
        <Badge label={`Ayrıştırma: ${n.parseStatus}`} color={n.parseStatus === 'parsed' ? colors.ok : colors.warning} />
      </View>
      {life.reasons.length > 0 ? (
        <Card style={{ borderColor: colors.warning }}>
          {life.reasons.map((r) => (
            <Body key={r}>• {r}</Body>
          ))}
        </Card>
      ) : null}

      <Card>
        <H2>Orijinal mesaj</H2>
        <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 13 }} testID="notam-raw">
          {n.raw}
        </Text>
      </Card>

      <Card>
        <H2>Yapılandırılmış alanlar</H2>
        <Row label="Tip" value={n.type} />
        <Row label="Referans" value={n.referencedId} mono />
        <Row label="Seri / No / Yıl" value={`${n.series ?? '?'} / ${n.number ?? '?'} / ${n.year ?? '?'}`} />
        <Row label="FIR (Q)" value={n.q?.fir} mono />
        <Row label="Q kodu" value={n.q ? `${n.q.code} — ${qCodeGroup(n.q.code).label}` : null} />
        <Row label="Traffic / Purpose / Scope" value={n.q ? `${n.q.traffic ?? '?'} / ${n.q.purpose ?? '?'} / ${n.q.scope ?? '?'}` : null} />
        <Row label="Q alt/üst (FL)" value={n.q ? `${n.q.lowerFl ?? '?'} / ${n.q.upperFl ?? '?'}` : null} />
        <Row label="A) Konum" value={n.locations.join(' ')} mono />
        <Row label="B) Başlangıç (UTC)" value={n.validFrom.iso ? n.validFrom.iso.replace('.000Z', 'Z') : n.validFrom.raw} mono />
        <Row label="C) Bitiş (UTC)" value={n.validTo.permanent ? 'PERM' : `${n.validTo.iso?.replace('.000Z', 'Z') ?? n.validTo.raw ?? '—'}${n.validTo.estimated ? ' EST' : ''}`} mono />
        <Row label="D) Program" value={n.schedule} mono />
        <Row label="F) Alt sınır" value={n.lower ? formatVerticalLimit(n.lower) : null} />
        <Row label="G) Üst sınır" value={n.upper ? formatVerticalLimit(n.upper) : null} />
      </Card>

      <Card>
        <H2>Geometri</H2>
        {n.geometry ? (
          <>
            <Row label="Tür" value={n.geometry.kind} />
            <Row label="Güven" value={n.geometry.confidence === 'confirmed' ? 'Doğrulandı (E maddesindeki koordinatlar)' : 'Yaklaşık (Q satırı merkez/yarıçap — gösterge niteliğinde)'} />
            <Row label="Merkez" value={centre ? formatLatLon(centre) : null} mono />
            <Row label="Yarıçap" value={n.geometry.radiusNm !== null ? `${n.geometry.radiusNm} NM` : null} />
            {centre ? (
              <Button
                title="Haritada göster"
                kind="secondary"
                onPress={() => router.push({ pathname: '/', params: { lat: String(centre.lat), lon: String(centre.lon), zoom: '8' } })}
              />
            ) : null}
          </>
        ) : (
          <Body dim>Güvenilir geometri yok — bu NOTAM haritada gösterilmez, yalnızca listede yer alır. Meydan ilişkisi, NOTAM&apos;ın yalnızca o meydanı etkilediği anlamına gelmez.</Body>
        )}
      </Card>

      <Card>
        <H2>Kaynak ve kalite</H2>
        <Row label="Kaynak" value={n.provenance.sourceId} />
        <Row label="Alınma zamanı" value={n.provenance.retrievedAt} mono />
        <Row label="Son doğrulama" value={n.lastVerifiedAt ?? 'Doğrulanmadı'} />
        <Row label="Kalite bayrakları" value={n.qualityFlags.length ? n.qualityFlags.join(', ') : 'yok'} />
      </Card>
      <Disclaimer />
    </Screen>
  );
}
