import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme';
import { avatarHue, initials } from '@/lib/format';
import { Text } from './Text';

export type AvatarProps = {
  /** URL firmato o pubblico. Se assente si usa il fallback con iniziali. */
  uri?: string | null;
  name?: string | null;
  /** Seed per il colore deterministico del fallback: usa l'id utente/gruppo. */
  seed?: string;
  size?: number;
  square?: boolean;
  style?: ViewStyle;
};

export function Avatar({ uri, name, seed, size = 40, square = false, style }: AvatarProps) {
  const theme = useTheme();
  const radius = square ? theme.radii.md : theme.radii.full;

  const shell: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgRaised,
  };

  if (uri) {
    return (
      <View style={[shell, style]}>
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  // Fallback: iniziali su tinta deterministica. Lo stesso utente ha sempre
  // lo stesso colore, su ogni dispositivo.
  const hue = avatarHue(seed ?? name ?? '?');
  const bg = `hsl(${hue}, ${theme.mode === 'dark' ? '38%, 26%' : '58%, 86%'})`;
  const fg = theme.mode === 'dark' ? `hsl(${hue}, 62%, 82%)` : `hsl(${hue}, 62%, 24%)`;

  return (
    <View style={[shell, { backgroundColor: bg }, style]}>
      <Text
        variant="scoreSmall"
        color={fg}
        style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.42) }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export type AvatarStackProps = {
  people: { id: string; name: string | null; uri?: string | null }[];
  size?: number;
  max?: number;
};

/** "Hanno recensito": fino a `max` avatar sovrapposti, poi un contatore. */
export function AvatarStack({ people, size = 28, max = 4 }: AvatarStackProps) {
  const theme = useTheme();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const label =
    people.length === 0
      ? 'Nessuna recensione'
      : `${people.length} ${people.length === 1 ? 'persona ha' : 'persone hanno'} recensito`;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar
            uri={p.uri}
            name={p.name}
            seed={p.id}
            size={size}
            style={{ borderWidth: 2, borderColor: theme.colors.bgSurface }}
          />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginLeft: -size * 0.32,
            width: size,
            height: size,
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.bgRaised,
            borderWidth: 2,
            borderColor: theme.colors.bgSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="scoreSmall" color="secondary" style={{ fontSize: size * 0.34 }}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
