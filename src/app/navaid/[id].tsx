import { useLocalSearchParams } from 'expo-router';
import { NavaidDetailScreen } from '@/features/airports/AirportDetailScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NavaidDetailScreen id={id ?? ''} />;
}
