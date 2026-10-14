import { SafeAreaView } from 'react-native-safe-area-context';
import { MapScreen } from '@/features/map/MapScreen';

export default function MapRoute() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <MapScreen />
    </SafeAreaView>
  );
}
