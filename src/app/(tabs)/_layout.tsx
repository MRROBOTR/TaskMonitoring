import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    // ColorValue may be an opaque platform colour; our palette only uses strings.
    return <MaterialCommunityIcons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Harita', headerShown: false, tabBarIcon: icon('map') }} />
      <Tabs.Screen name="notams" options={{ title: 'NOTAM', tabBarIcon: icon('alert-octagon') }} />
      <Tabs.Screen name="airports" options={{ title: 'Airports', tabBarIcon: icon('airport') }} />
      <Tabs.Screen name="plan" options={{ title: 'Flight Plan', tabBarIcon: icon('map-marker-path') }} />
      <Tabs.Screen name="documents" options={{ title: 'Dokümanlar', tabBarIcon: icon('file-pdf-box') }} />
      <Tabs.Screen name="more" options={{ title: 'Diğer', tabBarIcon: icon('dots-horizontal') }} />
    </Tabs>
  );
}
