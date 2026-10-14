import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { Body, Button, Card, H1, H2, Input, Screen } from '@/components/ui';
import { parseNotam } from '@/domain/notam/parser';
import { deleteNotamsBySource, upsertNotams } from '@/infrastructure/database/notamRepository';
import { importManualNotams } from '@/infrastructure/synchronization/sync';
import { MAX_IMPORT_CHARS } from '@/providers/notams/manualImport';
import * as Synthetic from '@/test/fixtures/notams.synthetic';
import * as Crypto from 'expo-crypto';

const SYNTHETIC_DEMO_SOURCE = 'synthetic-demo';

export function NotamImportScreen() {
  const { db, bumpRevision } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const doImport = async (input: string) => {
    setBusy(true);
    try {
      const res = await importManualNotams({ db, now: () => new Date(), newId: () => Crypto.randomUUID() }, input);
      bumpRevision();
      if (res.ok) {
        const c = res.result.counts;
        Alert.alert(
          'İçe aktarma tamamlandı',
          `${res.result.notams.length} mesaj: ${c.parsed} ayrıştırıldı, ${c.partial} kısmi, ${c['needs-review']} inceleme gerekli, ${c.failed} tanınmadı.\nYeni: ${res.result.upsert.inserted}, güncellenen: ${res.result.upsert.updated}, değişmeyen: ${res.result.upsert.unchanged}.`,
        );
        router.back();
      } else {
        Alert.alert('İçe aktarma başarısız', res.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'text/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const f = new File(r.assets[0].uri);
    if (f.size > MAX_IMPORT_CHARS) {
      Alert.alert('Dosya çok büyük');
      return;
    }
    setText(await f.text());
  };

  const loadSynthetic = async () => {
    const retrievedAt = new Date().toISOString();
    const msgs = [
      Synthetic.NEW_RWY_CLOSED, Synthetic.REPLACE_RWY, Synthetic.CANCEL_RWY, Synthetic.POLYGON_AREA,
      Synthetic.CIRCLE_AREA, Synthetic.PERM_NAVAID, Synthetic.EST_END, Synthetic.FIR_WIDE, Synthetic.BAD_DATES,
    ];
    await upsertNotams(db, msgs.map((m) => parseNotam(m, { sourceId: SYNTHETIC_DEMO_SOURCE, origin: 'synthetic', retrievedAt })));
    bumpRevision();
    Alert.alert('Simüle veri yüklendi', 'Bu mesajlar GERÇEK DEĞİLDİR ("XX" konum göstergeleri). Arayüzü test etmek içindir.');
  };

  const removeSynthetic = async () => {
    await deleteNotamsBySource(db, SYNTHETIC_DEMO_SOURCE);
    bumpRevision();
  };

  return (
    <Screen>
      <H1>NOTAM içe aktar</H1>
      <Body dim>
        Resmi brifing kaynağınızdan (ör. DHMİ AIS PIB) aldığınız ICAO formatındaki NOTAM metnini yapıştırın. Metin
        cihazda ayrıştırılır ve hiçbir yere gönderilmez. İçe aktarılan veriler &quot;Manuel içe aktarım&quot; olarak
        etiketlenir ve hiçbir zaman canlı veri olarak gösterilmez.
      </Body>
      <Input
        testID="notam-text-input"
        multiline
        value={text}
        onChangeText={setText}
        placeholder={'(A1234/26 NOTAMN\nQ) LTAA/QMRLC/IV/NBO/A/000/999/...\nA) LTFM B) 2610140600 C) 2610201800\nE) ...)'}
        style={{ minHeight: 220, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button title={busy ? 'İşleniyor…' : 'Ayrıştır ve kaydet'} disabled={busy || !text.trim()} onPress={() => doImport(text)} testID="notam-import-submit" />
      <Button title="Metin dosyasından yükle" kind="secondary" onPress={pickFile} />
      <Card>
        <H2>Geliştirme / test</H2>
        <Body dim>Arayüzü denemek için açıkça etiketlenmiş SİMÜLE NOTAM&apos;lar yükleyebilirsiniz. Bunlar gerçek değildir.</Body>
        <Button title="Simüle test NOTAM'ları yükle" kind="secondary" onPress={loadSynthetic} />
        <Button title="Simüle verileri sil" kind="danger" onPress={removeSynthetic} />
      </Card>
    </Screen>
  );
}
