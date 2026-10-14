import { useLocalSearchParams } from 'expo-router';
import { NotamDetailScreen } from '@/features/notams/NotamDetailScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NotamDetailScreen id={id ?? ''} />;
}
