import React from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/components/icons';
import { Button } from './Button';
import { Text } from './Text';

/**
 * Gli stati loading / empty / error / content sono mutuamente esclusivi e
 * gestiti sempre con questi tre componenti, cosi' la coerenza non dipende
 * dalla memoria di chi scrive la schermata. E' il pattern buono di WantABook,
 * reso riusabile.
 */

export function LoadingState({ label = 'Caricamento...' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ paddingVertical: theme.spacing[7], alignItems: 'center', gap: theme.spacing[3] }}
    >
      <ActivityIndicator color={theme.colors.accentBase} />
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon = 'list', title, message, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingVertical: theme.spacing[7],
        paddingHorizontal: theme.spacing[5],
        alignItems: 'center',
        gap: theme.spacing[3],
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: theme.radii.full,
          backgroundColor: theme.colors.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={30} color={theme.colors.accentBase} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="secondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: theme.spacing[2] }} />
      ) : null}
    </View>
  );
}

export type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  /** Compatto: un banner in cima alla lista invece di una schermata intera.
   *  Serve quando ci sono comunque dati in cache da mostrare: la lista non va
   *  mai svuotata per un errore di rete. */
  compact?: boolean;
  style?: ViewStyle;
};

export function ErrorState({ message, onRetry, compact = false, style }: ErrorStateProps) {
  const theme = useTheme();

  if (compact) {
    return (
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing[3],
            padding: theme.spacing[3],
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.bgRaised,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.warning,
          },
          style,
        ]}
      >
        <Icon name="warning" size={18} color={theme.colors.warning} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          {message}
        </Text>
        {onRetry ? <Button label="Riprova" variant="ghost" size="sm" onPress={onRetry} /> : null}
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={{
        paddingVertical: theme.spacing[7],
        paddingHorizontal: theme.spacing[5],
        alignItems: 'center',
        gap: theme.spacing[3],
      }}
    >
      <Icon name="warning" size={30} color={theme.colors.danger} />
      <Text variant="subheading" align="center">
        Non ha funzionato
      </Text>
      <Text variant="body" color="secondary" align="center">
        {message}
      </Text>
      {onRetry ? <Button label="Riprova" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export type SkeletonProps = { width?: number | `${number}%`; height?: number; radius?: number };

export function Skeleton({ width = '100%', height = 16, radius }: SkeletonProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: radius ?? theme.radii.sm,
        backgroundColor: theme.colors.bgRaised,
        opacity: reduced ? 1 : 0.7,
      }}
    />
  );
}

/** Scheletro di una riga della lista posti: stessa forma del contenuto reale,
 *  cosi' il passaggio non fa saltare il layout. */
export function PlaceRowSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing[3],
        padding: theme.spacing[4],
        alignItems: 'center',
      }}
    >
      <Skeleton width={56} height={56} radius={theme.radii.md} />
      <View style={{ flex: 1, gap: theme.spacing[2] }}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="45%" height={13} />
      </View>
      <Skeleton width={32} height={32} radius={theme.radii.full} />
    </View>
  );
}
