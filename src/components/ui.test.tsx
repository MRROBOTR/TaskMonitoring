import { render, screen } from '@testing-library/react-native';
import { FreshnessBanner } from './ui';

describe('FreshnessBanner', () => {
  it('shows a warning for stale data with the source and last update time', async () => {
    await render(<FreshnessBanner state="stale" source="OurAirports" lastSuccessAt="2026-09-01T10:00:00Z" />);
    expect(screen.getByTestId('freshness-stale')).toBeTruthy();
    expect(screen.getByText(/ESKİ VERİ/)).toBeTruthy();
    expect(screen.getByText(/2026-09-01 10:00Z/)).toBeTruthy();
  });

  it('never labels manual or synthetic data as live', async () => {
    await render(<FreshnessBanner state="manual-import" source="Manuel" lastSuccessAt={null} />);
    expect(screen.queryByText(/Güncel/)).toBeNull();
    expect(screen.getByText(/Manuel içe aktarım/)).toBeTruthy();
    expect(screen.getByText(/hiç/)).toBeTruthy();
  });
});
