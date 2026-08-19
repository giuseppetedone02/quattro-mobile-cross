import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bgCanvas },
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* Le modali: aggiunta posto, recensione, sincronizzazione, gruppi. */}
      <Stack.Screen name="place/add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="place/[id]/review" options={{ presentation: 'modal' }} />
      <Stack.Screen name="place/[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="place/[id]/sync" options={{ presentation: 'modal' }} />
      <Stack.Screen name="group/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="group/[id]/invite" options={{ presentation: 'modal' }} />
      <Stack.Screen name="review/[id]/move" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
