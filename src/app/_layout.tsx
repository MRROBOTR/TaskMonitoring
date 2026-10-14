import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '@/app-state/AppContext';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notam/[id]" options={{ title: 'NOTAM' }} />
        <Stack.Screen name="notam-import" options={{ title: 'NOTAM içe aktar' }} />
        <Stack.Screen name="airport/[id]" options={{ title: 'Airport' }} />
        <Stack.Screen name="navaid/[id]" options={{ title: 'Navaid' }} />
        <Stack.Screen name="document/[id]" options={{ title: 'Doküman' }} />
        <Stack.Screen name="emergency" options={{ title: 'Acil durum' }} />
        <Stack.Screen name="data" options={{ title: 'Data Management' }} />
        <Stack.Screen name="offline-maps" options={{ title: 'Çevrimdışı haritalar' }} />
      </Stack>
    </AppProvider>
  );
}
