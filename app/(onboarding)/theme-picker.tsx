import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { ThemeGallery } from '@/features/profile';
import { useTheme } from '@/theme';

/**
 * Prima scelta gradevole: si finisce l'onboarding facendo qualcosa di
 * piacevole invece di compilare un altro campo. Ed e' anche il momento in cui
 * l'utente scopre che l'app si puo' personalizzare (requisito 5).
 */
export default function ThemePicker() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing[5], paddingTop: theme.spacing[6] }}>
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="title">Scegli il tuo aspetto</Text>
          <Text variant="body" color="secondary">
            Lo puoi cambiare quando vuoi dal tuo profilo.
          </Text>
        </View>

        <ThemeGallery />

        <Button label="Iniziamo" full onPress={() => router.replace('/places')} />
      </View>
    </Screen>
  );
}
