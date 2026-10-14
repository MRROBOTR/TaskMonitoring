import { useLocalSearchParams } from 'expo-router';
import { DocumentReaderScreen } from '@/features/documents/DocumentReaderScreen';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentReaderScreen id={id ?? ''} />;
}
