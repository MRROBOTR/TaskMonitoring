/**
 * Offline basemap packages via MapLibre's OfflineManager. Downloads are
 * user-initiated, bounded (area, zoom, tile count) and cancellable.
 */
import { OfflineManager, type OfflinePack, type OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Body, Button, Card, Chip, H1, H2, Input, Row, Screen, styles as ui } from '@/components/ui';
import { formatBytes } from '@/domain/services/documentValidation';
import { useAsync } from '@/hooks/useAsync';
import { deleteMapPackage, listMapPackages, upsertMapPackage } from '@/infrastructure/database/appRepository';
import { estimateTileCount, OFFLINE_LIMITS, styleById } from '@/providers/basemap/styles';
import { colors } from '@/theme';

type Bbox = [number, number, number, number];

/** Geographic convenience presets (plain map extents, not aviation data). */
const PRESETS: { name: string; bounds: Bbox }[] = [
  { name: 'Marmara', bounds: [26.0, 39.8, 30.5, 41.8] },
  { name: 'Ankara çevresi', bounds: [31.5, 39.0, 34.5, 40.8] },
  { name: 'Ege', bounds: [26.0, 37.0, 29.0, 39.8] },
  { name: 'Antalya', bounds: [29.5, 36.0, 32.5, 37.6] },
];

export function OfflineMapsScreen() {
  const { db, settings, revision, bumpRevision } = useApp();
  const style = styleById(settings.basemapStyleId);
  const [name, setName] = useState('Marmara');
  const [bboxText, setBboxText] = useState(PRESETS[0]!.bounds.join(', '));
  const [maxZoom, setMaxZoom] = useState(10);
  const [live, setLive] = useState<Record<string, OfflinePackStatus>>({});
  const records = useAsync(() => listMapPackages(db), [db, revision]);

  const bbox = parseBbox(bboxText);
  const tiles = bbox ? estimateTileCount(bbox, 0, maxZoom) : 0;
  const area = bbox ? (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) : 0;
  const tooBig = !bbox || area > OFFLINE_LIMITS.maxAreaDeg2 || tiles > OFFLINE_LIMITS.maxTiles;

  const onProgress = (pack: OfflinePack, status: OfflinePackStatus) => {
      setLive((l) => ({ ...l, [pack.id]: status }));
      // Live progress comes from the native pack; persist only the final state.
      if (status.state === 'complete') {
        void listMapPackages(db).then((rows) => {
          const r = rows.find((x) => x.id === pack.id);
          if (r) {
            void upsertMapPackage(db, { ...r, state: 'complete', percentage: 100, completedBytes: status.completedResourceSize }).then(bumpRevision);
          }
        });
      }
  };

  const onError = (pack: OfflinePack, err: { message: string }) => {
      void listMapPackages(db).then((rows) => {
        const r = rows.find((x) => x.id === pack.id);
        if (r) void upsertMapPackage(db, { ...r, state: 'error', lastError: err.message }).then(bumpRevision);
      });
  };

  // Re-attach listeners to existing packs (e.g. after app restart) and read status.
  useEffect(() => {
    let cancelled = false;
    OfflineManager.getPacks()
      .then(async (packs) => {
        for (const p of packs) {
          const s = await p.status();
          if (!cancelled) setLive((l) => ({ ...l, [p.id]: s }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const create = async () => {
    if (!bbox || tooBig) return;
    try {
      const pack = await OfflineManager.createPack(
        { mapStyle: style.url, bounds: bbox, minZoom: 0, maxZoom, metadata: { name, createdBy: 'atlas-efb' } },
        onProgress,
        onError,
      );
      await upsertMapPackage(db, {
        id: pack.id,
        name,
        styleUrl: style.url,
        bounds: bbox,
        minZoom: 0,
        maxZoom,
        createdAt: new Date().toISOString(),
        state: 'active',
        completedBytes: 0,
        percentage: 0,
        lastError: null,
      });
      bumpRevision();
    } catch (e) {
      Alert.alert('Paket oluşturulamadı', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      OfflineManager.removeListener(id);
      await OfflineManager.deletePack(id);
    } catch {
      // Pack may already be gone natively; still drop the record.
    }
    await deleteMapPackage(db, id);
    bumpRevision();
  };

  return (
    <Screen>
      <H1>Çevrimdışı harita paketleri</H1>
      <Body dim>
        Basemap: {style.name}. Sağlayıcının toplu indirme koşulları belgelenmediği için paketler küçük bölgeler ve en fazla
        z{OFFLINE_LIMITS.maxZoom} ile sınırlıdır. Tüm dünya indirilmez. Çevrimdışı görüntülemeyi uçak modunda doğrulayın.
      </Body>
      <Card>
        <H2>Yeni paket</H2>
        <View style={ui.wrap}>
          {PRESETS.map((p) => (
            <Chip key={p.name} label={p.name} active={name === p.name} onPress={() => { setName(p.name); setBboxText(p.bounds.join(', ')); }} />
          ))}
        </View>
        <Input value={name} onChangeText={setName} placeholder="Paket adı" />
        <Text style={ui.dim}>Sınırlar (Batı, Güney, Doğu, Kuzey — WGS-84 derece)</Text>
        <Input value={bboxText} onChangeText={setBboxText} keyboardType="numbers-and-punctuation" />
        <View style={ui.wrap}>
          {[8, 10, 12].map((z) => (
            <Chip key={z} label={`max z${z}`} active={maxZoom === z} onPress={() => setMaxZoom(z)} />
          ))}
        </View>
        <Row label="Tahmini karo sayısı" value={bbox ? `${tiles.toLocaleString()} (sınır ${OFFLINE_LIMITS.maxTiles.toLocaleString()})` : 'Geçersiz sınırlar'} />
        {tooBig && bbox ? <Text style={{ color: colors.warning }}>Bölge veya karo sayısı sınırı aşıyor; alanı küçültün ya da zoom düzeyini düşürün.</Text> : null}
        <Button title="İndir" disabled={tooBig} onPress={create} testID="offline-create" />
      </Card>

      <H2>Paketler</H2>
      {(records.data ?? []).length === 0 ? <Body dim>Henüz paket yok.</Body> : null}
      {(records.data ?? []).map((r) => {
        const s = live[r.id];
        const pct = s?.percentage ?? r.percentage;
        const state = s?.state ?? r.state;
        return (
          <Card key={r.id}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{r.name}</Text>
            <Row label="Durum" value={`${state === 'complete' ? 'Tamamlandı' : state === 'active' ? 'İndiriliyor' : state === 'error' ? 'HATA' : 'Duraklatıldı / eksik'} · %${pct.toFixed(0)}`} />
            <Row label="Boyut" value={formatBytes(s?.completedResourceSize ?? r.completedBytes)} />
            <Row label="Sınırlar" value={r.bounds.map((v) => v.toFixed(2)).join(', ')} mono />
            <Row label="Zoom" value={`${r.minZoom}–${r.maxZoom}`} />
            {r.lastError ? <Text style={{ color: colors.danger }}>{r.lastError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {state !== 'complete' ? (
                <Button
                  title={state === 'active' ? 'Duraklat' : 'Devam et'}
                  kind="secondary"
                  onPress={async () => {
                    const pack = await OfflineManager.getPack(r.id);
                    if (state === 'active') await pack.pause();
                    else {
                      await OfflineManager.addListener(r.id, onProgress, onError);
                      await pack.resume();
                    }
                    setLive((l) => ({ ...l, [r.id]: { ...(l[r.id] ?? ({} as OfflinePackStatus)), state: state === 'active' ? 'inactive' : 'active' } }));
                  }}
                />
              ) : null}
              <Button title="Sil" kind="danger" onPress={() => remove(r.id)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

export function parseBbox(text: string): Bbox | null {
  const parts = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts as Bbox;
  if (w < -180 || e > 180 || s < -85 || n > 85 || w >= e || s >= n) return null;
  return [w, s, e, n];
}
