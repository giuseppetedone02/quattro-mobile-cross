import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import { MAX_PHOTOS_PER_REVIEW } from '@/lib/photos';
import { IconButton } from './Button';
import { PressScale } from './Pressable';
import { Text } from './Text';

export type PhotoGridProps = {
  photos: { id: string; uri: string; blurhash?: string | null }[];
  onPressPhoto?: (index: number) => void;
  size?: number;
  style?: ViewStyle;
};

export function PhotoGrid({ photos, onPressPhoto, size = 84, style }: PhotoGridProps) {
  const theme = useTheme();
  if (photos.length === 0) return null;

  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }, style]}>
      {photos.map((p, i) => (
        <PressScale
          key={p.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Foto ${i + 1} di ${photos.length}`}
          onPress={onPressPhoto ? () => onPressPhoto(i) : undefined}
          disabled={!onPressPhoto}
          style={{
            width: size,
            height: size,
            borderRadius: theme.radii.md,
            overflow: 'hidden',
            backgroundColor: theme.colors.bgRaised,
          }}
        >
          <Image
            source={{ uri: p.uri }}
            // Il blurhash e' il dettaglio che si nota: la foto non appare dal
            // nulla, sfuma da una sagoma coerente.
            placeholder={p.blurhash ? { blurhash: p.blurhash } : undefined}
            placeholderContentFit="cover"
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
          />
        </PressScale>
      ))}
    </View>
  );
}

export type PhotoPickerProps = {
  photos: { id: string; uri: string }[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  max?: number;
  disabled?: boolean;
};

/** Griglia editabile: foto scelte + pulsante di aggiunta, con limite. */
export function PhotoPicker({
  photos,
  onAdd,
  onRemove,
  max = MAX_PHOTOS_PER_REVIEW,
  disabled,
}: PhotoPickerProps) {
  const theme = useTheme();
  const size = 84;
  const canAdd = photos.length < max && !disabled;

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
        {photos.map((p, i) => (
          <View key={p.id} style={{ width: size, height: size }}>
            <Image
              source={{ uri: p.uri }}
              style={{
                width: size,
                height: size,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.bgRaised,
              }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
              accessibilityLabel={`Foto ${i + 1}`}
            />
            <IconButton
              icon="close"
              accessibilityLabel={`Rimuovi la foto ${i + 1}`}
              size={28}
              variant="filled"
              onPress={() => onRemove(p.id)}
              style={{ position: 'absolute', top: -8, right: -8 }}
            />
          </View>
        ))}

        {canAdd ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Aggiungi una foto"
            accessibilityHint={`Puoi allegare fino a ${max} foto`}
            onPress={onAdd}
            style={{
              width: size,
              height: size,
              borderRadius: theme.radii.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Icon name="camera" size={22} color={theme.colors.textSecondary} />
            <Text variant="caption" color="secondary" style={{ fontSize: 11 }}>
              Aggiungi
            </Text>
          </PressScale>
        ) : null}
      </View>

      {photos.length >= max ? (
        <Text variant="caption" color="secondary">
          Hai raggiunto il massimo di {max} foto.
        </Text>
      ) : null}
    </View>
  );
}
