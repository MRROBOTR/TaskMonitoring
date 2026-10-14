import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getSetting, setSetting } from '@/infrastructure/database/appRepository';
import { openAppDatabase } from '@/infrastructure/database/client';
import type { SqlDatabase } from '@/infrastructure/database/sql';
import { DEFAULT_LAYER_VISIBILITY, type LayerId } from '@/features/map/layers';
import { colors } from '@/theme';

export interface AppSettings {
  basemapStyleId: string;
  referenceCountries: string[];
  activeRouteId: string | null;
  layers: Record<LayerId, boolean>;
  showExpiredNotams: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  basemapStyleId: 'ofm-liberty',
  referenceCountries: ['TR'],
  activeRouteId: null,
  layers: DEFAULT_LAYER_VISIBILITY,
  showExpiredNotams: false,
};

interface AppContextValue {
  db: SqlDatabase;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Incremented after any data change so screens can reload. */
  revision: number;
  bumpRevision: () => void;
  online: boolean | null;
}

const Ctx = createContext<AppContextValue | null>(null);

/** Exposed for component tests that need to supply an in-memory context. */
export const AppContextForTests = Ctx;
export type { AppContextValue };

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [revision, setRevision] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    openAppDatabase()
      .then(async (d) => {
        const stored = await getSetting<Partial<AppSettings>>(d, 'app', {});
        setSettings({
          ...DEFAULT_SETTINGS,
          ...stored,
          layers: { ...DEFAULT_LAYER_VISIBILITY, ...(stored.layers ?? {}) },
        });
        setDb(d);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected === null ? null : s.isConnected && s.isInternetReachable !== false);
      }),
    [],
  );

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!db) return;
      const next = { ...settings, ...patch };
      setSettings(next);
      await setSetting(db, 'app', next);
    },
    [db, settings],
  );

  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);

  const value = useMemo(
    () => (db ? { db, settings, updateSettings, revision, bumpRevision, online } : null),
    [db, settings, updateSettings, revision, bumpRevision, online],
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Veritabanı açılamadı</Text>
        <Text style={styles.dim}>{error}</Text>
      </View>
    );
  }
  if (!value) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Yerel veritabanı hazırlanıyor…</Text>
      </View>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24, gap: 8 },
  error: { color: colors.danger, fontSize: 18, fontWeight: '700' },
  dim: { color: colors.textDim, textAlign: 'center' },
});
