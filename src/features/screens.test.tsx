/**
 * Screen-level UI tests. They render real screens against a real in-memory
 * SQLite database (node:sqlite). Native-only pieces (map rendering, PDF view,
 * file picker) are not exercised here — see docs/TESTING.md.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppContextForTests, DEFAULT_SETTINGS, type AppContextValue, type AppSettings } from '@/app-state/AppContext';
import { parseNotam } from '@/domain/notam/parser';
import { migrate } from '@/infrastructure/database/migrations';
import { upsertNotams } from '@/infrastructure/database/notamRepository';
import { registerSources } from '@/infrastructure/database/sourceRepository';
import { ALL_SOURCES } from '@/providers/registry';
import * as S from '@/test/fixtures/notams.synthetic';
import { createTestDatabase } from '@/test/nodeSqlite';
import { LayerPanel } from './map/LayerPanel';
import { NotamListScreen } from './notams/NotamListScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

async function makeContext(settings: Partial<AppSettings> = {}) {
  const db = createTestDatabase();
  await migrate(db);
  await registerSources(db, ALL_SOURCES);
  const value: AppContextValue = {
    db,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    updateSettings: jest.fn(async () => undefined),
    revision: 0,
    bumpRevision: jest.fn(),
    online: true,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppContextForTests.Provider value={value}>{children}</AppContextForTests.Provider>
  );
  return { db, value, wrapper };
}

describe('NOTAM list screen', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-15T12:00:00Z'), advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  it('shows an empty, not-configured state without data', async () => {
    const { wrapper } = await makeContext();
    await render(<NotamListScreen />, { wrapper });
    await waitFor(() => expect(screen.getByText('NOTAM yok')).toBeTruthy());
    expect(screen.getByTestId('freshness-not-configured')).toBeTruthy();
  });

  it('labels synthetic data, hides superseded notices by default and reveals them on request', async () => {
    const { db, wrapper } = await makeContext();
    const ctx = { sourceId: 'synthetic-demo', origin: 'synthetic' as const, retrievedAt: '2026-10-15T11:00:00Z' };
    await upsertNotams(db, [S.NEW_RWY_CLOSED, S.REPLACE_RWY, S.CANCEL_RWY, S.POLYGON_AREA, S.CIRCLE_AREA, S.EST_END].map((m) => parseNotam(m, ctx)));

    await render(<NotamListScreen />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('notam-row-B0201/26')).toBeTruthy());
    expect(screen.getByTestId('freshness-synthetic')).toBeTruthy();
    expect(screen.getAllByText('SİMÜLE').length).toBeGreaterThan(0);
    // EST end passed -> unknown state is shown, not silently expired
    expect(screen.getByTestId('notam-row-C0302/26')).toBeTruthy();
    // Replaced, cancelled and expired notices are hidden by default
    expect(screen.queryByTestId('notam-row-A0101/26')).toBeNull();
    expect(screen.queryByTestId('notam-row-A0102/26')).toBeNull();
    expect(screen.queryByTestId('notam-row-B0202/26')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('Değiştirildi'));
    });
    expect(screen.getByTestId('notam-row-A0101/26')).toBeTruthy();
  });
});

describe('layer panel', () => {
  it('toggles an available layer and keeps unavailable layers disabled with a reason', async () => {
    const { value, wrapper } = await makeContext();
    await render(<LayerPanel onClose={() => undefined} />, { wrapper });
    await act(async () => {
      fireEvent(screen.getByTestId('layer-toggle-vor'), 'valueChange', false);
    });
    expect(value.updateSettings).toHaveBeenCalledWith({ layers: expect.objectContaining({ vor: false, ndb: true }) });

    const airways = screen.getByTestId('layer-toggle-airways');
    expect(airways.props.disabled).toBe(true);
    expect(airways.props.value).toBe(false);
    expect(screen.getAllByText(/Yetkili veri kaynağı yapılandırılmadı/).length).toBeGreaterThan(0);
  });
});
