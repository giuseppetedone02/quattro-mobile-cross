import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/layout';
import { Button, Diamond, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { CRITERIA, CRITERION_META } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/icons';

const CRITERION_ICON: Record<string, IconName> = {
  location: 'location',
  service: 'service',
  menu: 'menu',
  value: 'receipt',
};

export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll contentStyle={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', paddingTop: theme.spacing[7], gap: theme.spacing[5] }}>
        {/* Il Diamante e' il marchio: la prima cosa che si vede e' la forma
            che poi accompagna ogni posto dell'app. */}
        <Diamond
          scores={{ location: 9, service: 6, menu: 8, value: 7 }}
          scale="hero"
          size={200}
          showAxes
          animated={false}
        />

        <View style={{ alignItems: 'center', gap: theme.spacing[2] }}>
          <Text variant="display" align="center">
            BiteMark
          </Text>
          <Text variant="body" color="secondary" align="center">
            I posti dove hai mangiato, giudicati sulle cose che contano.
            Da soli o con chi vuoi.
          </Text>
        </View>

        <View style={{ gap: theme.spacing[3], width: '100%', marginTop: theme.spacing[3] }}>
          {CRITERIA.map((c) => (
            <View
              key={c}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radii.full,
                  backgroundColor: theme.colors.bgRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={CRITERION_ICON[c] ?? 'star'}
                  size={19}
                  color={theme.criterionColor(c)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{CRITERION_META[c].label}</Text>
                <Text variant="caption" color="secondary">
                  {CRITERION_META[c].hint}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing[3], marginTop: theme.spacing[6] }}>
        <LinearGradient
          colors={[theme.colors.accentBase, theme.colors.accentBase]}
          style={{ borderRadius: theme.radii.md }}
        >
          <Button
            label="Continua con Google"
            icon="google"
            full
            onPress={() => router.push('/sign-in')}
          />
        </LinearGradient>
        <Button
          label="Usa la tua email"
          variant="secondary"
          icon="mail"
          full
          onPress={() => router.push('/sign-up')}
        />
        <Button
          label="Ho gia un account"
          variant="ghost"
          full
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </Screen>
  );
}
