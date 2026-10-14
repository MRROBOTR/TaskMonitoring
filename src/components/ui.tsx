import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { FRESHNESS_LABELS, formatAge, isWarningState } from '@/domain/services/freshness';
import type { FreshnessState } from '@/domain/models/provenance';
import { colors, font, spacing } from '@/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={styles.screen}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function Body({ children, dim, mono }: { children: ReactNode; dim?: boolean; mono?: boolean }) {
  return <Text style={[styles.body, dim && styles.dim, mono && styles.mono]}>{children}</Text>;
}

export function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable>
        {value === null || value === undefined || value === '' ? '—' : value}
      </Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: color ?? colors.accent, borderColor: color ?? colors.accent }]}
    >
      <Text style={[styles.chipText, active && { color: '#000' }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textDim} {...props} style={[styles.input, props.style]} />;
}

const FRESHNESS_COLORS: Record<FreshnessState, string> = {
  live: colors.ok,
  cached: colors.accent,
  stale: colors.danger,
  'update-failed': colors.warning,
  unavailable: colors.danger,
  'not-configured': colors.textDim,
  'manual-import': colors.manual,
  synthetic: colors.synthetic,
};

export function FreshnessBanner({
  state,
  source,
  lastSuccessAt,
  detail,
}: {
  state: FreshnessState;
  source: string;
  lastSuccessAt: string | null;
  detail?: string;
}) {
  const color = FRESHNESS_COLORS[state];
  return (
    <View
      testID={`freshness-${state}`}
      accessibilityLabel={`${source}: ${FRESHNESS_LABELS[state]}`}
      style={[styles.banner, { borderLeftColor: color }, isWarningState(state) && { backgroundColor: '#2A1E10' }]}
    >
      <Text style={[styles.bannerTitle, { color }]}>
        {isWarningState(state) ? '⚠ ' : ''}
        {FRESHNESS_LABELS[state]}
      </Text>
      <Text style={styles.bannerText}>
        Kaynak: {source} · Son başarılı güncelleme: {lastSuccessAt ? `${new Date(lastSuccessAt).toISOString().slice(0, 16).replace('T', ' ')}Z (${formatAge(lastSuccessAt)})` : 'hiç'}
      </Text>
      {detail ? <Text style={styles.bannerText}>{detail}</Text> : null}
    </View>
  );
}

export function Empty({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.h2}>{title}</Text>
      {detail ? <Text style={[styles.body, styles.dim, { textAlign: 'center' }]}>{detail}</Text> : null}
      {children}
    </View>
  );
}

export function Disclaimer() {
  return (
    <Text style={styles.disclaimer}>
      ATLAS EFB sertifikalı değildir ve resmi havacılık yayınlarının (AIP, NOTAM, PIB) veya zorunlu uçuş öncesi brifingin
      yerine geçmez. Tüm veriler eksik, gecikmiş veya hatalı olabilir.
    </Text>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  card: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h1: { color: colors.text, fontSize: font.h1, fontWeight: '700' },
  h2: { color: colors.text, fontSize: font.title, fontWeight: '700' },
  body: { color: colors.text, fontSize: font.body },
  dim: { color: colors.textDim },
  mono: { fontFamily: font.mono },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 3 },
  rowLabel: { color: colors.textDim, fontSize: font.small + 1, flexShrink: 0 },
  rowValue: { color: colors.text, fontSize: font.body - 1, flexShrink: 1, textAlign: 'right' },
  button: { backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center' },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: font.body },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surfaceAlt },
  chipText: { color: colors.text, fontSize: font.small + 1 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceAlt, color: colors.text, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: font.body },
  banner: { backgroundColor: colors.surface, borderLeftWidth: 4, padding: spacing.sm, borderRadius: 6, gap: 2 },
  bannerTitle: { fontWeight: '800', fontSize: font.small + 1 },
  bannerText: { color: colors.textDim, fontSize: font.small },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  disclaimer: { color: colors.textDim, fontSize: 11, fontStyle: 'italic' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
