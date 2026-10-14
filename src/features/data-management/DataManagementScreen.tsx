import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Badge, Body, Button, Card, FreshnessBanner, H1, H2, Input, Row, Screen, styles as ui } from '@/components/ui';
import { DEFAULT_THRESHOLDS, evaluateFreshness } from '@/domain/services/freshness';
import { formatBytes } from '@/domain/services/documentValidation';
import { useAsync } from '@/hooks/useAsync';
import { purgeExpiredNotams } from '@/infrastructure/database/notamRepository';
import { referenceCounts } from '@/infrastructure/database/referenceRepository';
import { listSourceStates, recentSyncRuns } from '@/infrastructure/database/sourceRepository';
import { storageUsage } from '@/infrastructure/filesystem/documentStorage';
import { NETWORK_ERROR_LABELS, type NetworkErrorKind } from '@/infrastructure/networking/http';
import { syncOurAirports } from '@/infrastructure/synchronization/sync';
import { downloadOurAirports, OURAIRPORTS_SOURCE_ID } from '@/providers/aviation/ourairports';
import { ALL_SOURCES } from '@/providers/registry';
import { colors } from '@/theme';

const VERIFICATION_COLORS = { verified: colors.ok, partial: colors.caution, unverified: colors.warning, blocked: colors.danger };

export function DataManagementScreen() {
  const { db, revision, bumpRevision, settings, updateSettings, online } = useApp();
  const [countries, setCountries] = useState(settings.referenceCountries.join(','));
  const [syncing, setSyncing] = useState(false);

  const states = useAsync(() => listSourceStates(db), [db, revision]);
  const counts = useAsync(() => referenceCounts(db), [db, revision]);
  const runs = useAsync(() => recentSyncRuns(db, OURAIRPORTS_SOURCE_ID, 5), [db, revision]);
  const storage = useAsync(async () => storageUsage(), [revision]);

  const oa = states.data?.find((s) => s.id === OURAIRPORTS_SOURCE_ID);
  const oaFreshness = oa
    ? evaluateFreshness(
        { configured: true, origin: 'provider', lastSuccessAt: oa.lastSuccessAt, lastAttemptAt: oa.lastAttemptAt, lastAttemptFailed: oa.lastAttemptFailed, hasData: (counts.data?.airports ?? 0) > 0 },
        DEFAULT_THRESHOLDS.reference,
      )
    : 'not-configured';

  const runSync = async () => {
    const list = countries
      .split(/[\s,]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));
    if (list.length === 0) {
      Alert.alert('Ülke kodu gerekli', 'ISO 3166-1 alpha-2 kodları girin (ör. TR, GR, BG).');
      return;
    }
    setSyncing(true);
    await updateSettings({ referenceCountries: list });
    const res = await syncOurAirports({ db, now: () => new Date(), newId: () => Crypto.randomUUID() }, () => downloadOurAirports(), list);
    setSyncing(false);
    bumpRevision();
    if (res.ok) {
      Alert.alert('Güncellendi', `${res.result.airports} airport, ${res.result.runways} runway, ${res.result.navaids} navaid kaydedildi.${res.result.rejected.length ? ` ${res.result.rejected.length} kayıt geçersiz koordinat nedeniyle reddedildi.` : ''}`);
    } else {
      const label = NETWORK_ERROR_LABELS[res.errorKind as NetworkErrorKind] ?? res.errorKind;
      Alert.alert('Güncelleme başarısız — mevcut yerel veri korundu', `${label}: ${res.message}`);
    }
  };

  return (
    <Screen>
      <H1>Data Management</H1>
      <Text style={{ color: online === false ? colors.warning : colors.textDim }}>
        Ağ durumu: {online === null ? 'bilinmiyor' : online ? 'çevrimiçi' : 'ÇEVRİMDIŞI — yalnızca yerel veriler kullanılabilir'}
      </Text>

      <Card>
        <H2>Havacılık referans verisi (OurAirports)</H2>
        <FreshnessBanner state={oaFreshness} source="OurAirports" lastSuccessAt={oa?.lastSuccessAt ?? null} detail={oa?.lastAttemptFailed ? `Son deneme başarısız: ${oa.lastError}` : undefined} />
        <Row label="Airports / Runways / Navaids" value={`${counts.data?.airports ?? 0} / ${counts.data?.runways ?? 0} / ${counts.data?.navaids ?? 0}`} />
        <Row label="Veri sürümü (indirme tarihi)" value={oa?.dataVersion} />
        <Text style={ui.dim}>Ülkeler (ISO kodları, virgülle):</Text>
        <Input value={countries} onChangeText={setCountries} autoCapitalize="characters" testID="countries-input" />
        <Body dim>
          İndirme: dünya geneli CSV dosyaları (~20 MB) indirilir, seçilen ülkelere filtrelenip cihazda saklanır. Başarısız
          indirme mevcut veriyi silmez.
        </Body>
        <Button title={syncing ? 'İndiriliyor…' : 'Şimdi güncelle'} disabled={syncing} onPress={runSync} testID="sync-ourairports" />
        {(runs.data ?? []).map((r) => (
          <Text key={r.id} style={[ui.dim, { fontFamily: 'monospace', fontSize: 11 }]}>
            {r.startedAt.slice(0, 16)} {r.status.toUpperCase()} {r.recordsStored} kayıt {r.errorKind ? `· ${r.errorKind}` : ''}
          </Text>
        ))}
      </Card>

      <Card>
        <H2>Çevrimdışı harita</H2>
        <Body dim>Basemap için seçilen bölgeleri indirin. Havacılık verisi ve dokümanlar zaten cihazda saklanır.</Body>
        <Button title="Çevrimdışı harita paketleri" kind="secondary" onPress={() => router.push('/offline-maps')} />
      </Card>

      <Card>
        <H2>Yerel depolama</H2>
        <Row label="PDF dosyaları" value={storage.data ? `${storage.data.files} dosya · ${formatBytes(storage.data.bytes)}` : '…'} />
        <Button
          title="30 günden eski süresi dolmuş NOTAM'ları temizle"
          kind="secondary"
          onPress={async () => {
            const n = await purgeExpiredNotams(db, new Date(), 30);
            bumpRevision();
            Alert.alert('Temizlendi', `${n} NOTAM silindi (PERM/EST olanlar korunur).`);
          }}
        />
      </Card>

      <H2>Veri kaynakları</H2>
      {ALL_SOURCES.map((s) => {
        const st = states.data?.find((x) => x.id === s.id);
        return (
          <Card key={s.id}>
            <View style={ui.wrap}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{s.name}</Text>
              <Badge label={s.verification.toUpperCase()} color={VERIFICATION_COLORS[s.verification]} />
            </View>
            <Row label="Kategoriler" value={s.categories.join(', ')} />
            <Row label="Kapsam" value={s.coverage} />
            <Row label="Erişim" value={s.access} />
            <Row label="Lisans" value={s.license} />
            <Row label="Çevrimdışı saklama izni" value={s.offlineStoragePermitted === null ? 'Doğrulanmadı' : s.offlineStoragePermitted ? 'Evet' : 'Hayır'} />
            <Row label="Son başarılı senk." value={st?.lastSuccessAt ?? '—'} />
            {s.limitations.map((l) => (
              <Text key={l} style={[ui.dim, { fontSize: 12 }]}>• {l}</Text>
            ))}
            {s.documentationUrl.startsWith('https://') ? (
              <Text style={{ color: colors.accent }} onPress={() => Linking.openURL(s.documentationUrl)}>{s.documentationUrl}</Text>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
