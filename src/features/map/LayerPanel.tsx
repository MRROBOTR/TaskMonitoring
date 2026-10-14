import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { BASEMAP_STYLES } from '@/providers/basemap/styles';
import { colors } from '@/theme';
import { Chip } from '@/components/ui';
import { LAYERS, type LayerDef } from './layers';

export function LayerPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useApp();
  const groups = LAYERS.reduce<Record<string, LayerDef[]>>((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {});

  return (
    <View style={styles.panel} testID="layer-panel">
      <View style={styles.header}>
        <Text style={styles.title}>Katmanlar ve lejant</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 16 }}>
        <Text style={styles.group}>Base map</Text>
        <View style={styles.wrap}>
          {BASEMAP_STYLES.map((s) => (
            <Chip key={s.id} label={s.name} active={settings.basemapStyleId === s.id} onPress={() => updateSettings({ basemapStyleId: s.id })} />
          ))}
        </View>
        {Object.entries(groups).map(([group, layers]) => (
          <View key={group} style={{ gap: 4 }}>
            <Text style={styles.group}>{group}</Text>
            {layers.map((l) => {
              const unavailable = l.unavailableReason !== null;
              return (
                <View key={l.id} style={styles.row}>
                  <View style={[styles.swatch, { backgroundColor: l.legendColor }, unavailable && { opacity: 0.3 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, unavailable && styles.dim]}>{l.label}</Text>
                    {unavailable ? <Text style={styles.reason}>Kullanılamıyor: {l.unavailableReason}</Text> : null}
                  </View>
                  <Switch
                    testID={`layer-toggle-${l.id}`}
                    disabled={unavailable}
                    value={!unavailable && settings.layers[l.id]}
                    onValueChange={(v) => updateSettings({ layers: { ...settings.layers, [l.id]: v } })}
                  />
                </View>
              );
            })}
          </View>
        ))}
        <View style={styles.row}>
          <Text style={[styles.label, { flex: 1 }]}>Süresi dolmuş / iptal edilmiş NOTAM&apos;ları da göster</Text>
          <Switch value={settings.showExpiredNotams} onValueChange={(v) => updateSettings({ showExpiredNotams: v })} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={styles.group}>Lejant</Text>
          <Text style={styles.legend}>● dolu mavi: Airport (büyük daire = large) · mor: Heliport</Text>
          <Text style={styles.legend}>○ turkuaz halka: VOR · dolu turkuaz: VOR/DME · kalın halka: VORTAC</Text>
          <Text style={styles.legend}>● açık mavi: DME / TACAN · ○ kahverengi halka: NDB</Text>
          <Text style={styles.legend}>Kırmızı düz çizgi: NOTAM geometrisi metinden doğrulandı (confirmed)</Text>
          <Text style={styles.legend}>Turuncu kesikli çizgi: Q satırından türetilmiş yaklaşık alan (approximate)</Text>
          <Text style={styles.legend}>Semboller ICAO harita sembolojisi değildir; tip etiketleri her zaman gösterilir.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 8, bottom: 8, right: 8, width: 320, maxWidth: '92%', backgroundColor: 'rgba(19,28,46,0.97)', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  close: { color: colors.text, fontSize: 20, padding: 4 },
  group: { color: colors.accent, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  label: { color: colors.text, fontSize: 14 },
  dim: { color: colors.textDim },
  reason: { color: colors.textDim, fontSize: 11 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  legend: { color: colors.textDim, fontSize: 12 },
});
