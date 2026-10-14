import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Body, Card, Disclaimer, H1, H2, Row, Screen } from '@/components/ui';
import { colors } from '@/theme';
import { DEFAULT_THRESHOLDS } from '@/domain/services/freshness';
import Constants from 'expo-constants';

const ITEMS: { title: string; detail: string; href: '/emergency' | '/data' | '/offline-maps' }[] = [
  { title: 'Acil durum / QRH / Checklists', detail: 'Tek dokunuşla çevrimdışı acil durum dokümanları', href: '/emergency' },
  { title: 'Data Management', detail: 'Veri kaynakları, senkronizasyon, lisanslar, depolama', href: '/data' },
  { title: 'Çevrimdışı haritalar', detail: 'Basemap bölge paketleri', href: '/offline-maps' },
];

export function MoreScreen() {
  return (
    <Screen>
      <H1>Diğer</H1>
      {ITEMS.map((i) => (
        <Pressable key={i.href} onPress={() => router.push(i.href)} style={styles.item}>
          <Text style={styles.title}>{i.title}</Text>
          <Text style={styles.detail}>{i.detail}</Text>
        </Pressable>
      ))}

      <Card>
        <H2>Ayarlar</H2>
        <Row label="Birimler" value="NM · kt · ft · UTC (sabit)" />
        <Row label="NOTAM 'güncel' eşiği" value={`${DEFAULT_THRESHOLDS.notam.liveMs / 60000} dk`} />
        <Row label="NOTAM 'eski' eşiği" value={`${DEFAULT_THRESHOLDS.notam.staleMs / 3600000} sa`} />
        <Row label="Referans veri 'eski' eşiği" value={`${DEFAULT_THRESHOLDS.reference.staleMs / 86400000} gün`} />
        <Body dim>Basemap stili ve katmanlar harita ekranındaki Katman panelinden değiştirilir.</Body>
      </Card>

      <Card>
        <H2>Gizlilik</H2>
        <Body dim>
          • PDF dokümanları ve NOTAM metinleri cihazda kalır, hiçbir sunucuya yüklenmez.{'\n'}• Konum yalnızca haritada
          göstermek için kullanılır, kaydedilmez veya gönderilmez.{'\n'}• Cihazdan çıkan istekler: basemap karoları
          (OpenFreeMap) ve kullanıcı başlattığında OurAirports CSV indirmesi.{'\n'}• Analitik / telemetri yoktur.
        </Body>
      </Card>

      <Card>
        <H2>Hakkında</H2>
        <Row label="Sürüm" value={Constants.expoConfig?.version ?? '—'} />
        <Body dim>Harita: MapLibre Native · OpenFreeMap © OpenMapTiles · © OpenStreetMap katkıcıları</Body>
        <Body dim>Airport/navaid verisi: OurAirports (Public Domain)</Body>
        <Disclaimer />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  detail: { color: colors.textDim, marginTop: 2 },
});
