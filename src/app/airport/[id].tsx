import { useLocalSearchParams } from 'expo-router';
import { AirportDetailScreen } from '@/features/airports/AirportDetailScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AirportDetailScreen id={id ?? ''} />;
}
