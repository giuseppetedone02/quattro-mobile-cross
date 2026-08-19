import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { CRITERION_META, type Criterion } from '@/theme/tokens';
import { Card, ScoreBadge, Skeleton, Text } from '@/components/ui';
import { Icon, type IconName } from '@/components/icons';
import { formatCents, formatScore } from '@/lib/format';

export type CriterionAverage = { criterion: Criterion; average: number };

export type ProfileStats = {
  reviewCount: number;
  avgOverall: number | null;
  avgCostPerPersonCents: number | null;
  harshest: CriterionAverage | null;
  kindest: CriterionAverage | null;
};

export type StatsPanelProps = {
  /** null = nessun dato (utente nuovo, o statistiche non disponibili). */
  stats: ProfileStats | null;
  loading?: boolean;
};

/** Ogni criterio ha anche un'icona propria: il colore non basta mai da solo. */
const CRITERION_ICON: Record<Criterion, IconName> = {
  location: 'location',
  service: 'service',
  menu: 'menu',
  value: 'receipt',
};

/**
 * "I tuoi numeri". Riceve le statistiche come props e non le carica: le
 * recensioni sono di un'altra feature, e un pannello che sa solo disegnare si
 * riusa anche nel profilo di un altro utente.
 */
export function StatsPanel({ stats, loading = false }: StatsPanelProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Card style={{ gap: theme.spacing[4] }}>
        <Skeleton width="40%" height={12} />
        <View style={{ flexDirection: 'row', gap: theme.spacing[4] }}>
          <Skeleton width={72} height={44} radius={theme.radii.md} />
          <Skeleton width={72} height={44} radius={theme.radii.md} />
        </View>
        <Skeleton width="70%" height={14} />
      </Card>
    );
  }

  if (!stats || stats.reviewCount === 0) {
    return (
      <Card style={{ gap: theme.spacing[2] }}>
        <Text variant="label" uppercase color="secondary">
          I tuoi numeri
        </Text>
        <Text variant="body" color="secondary">
          {'Appena scrivi la prima recensione qui compaiono la tua media, quanto spendi in media ' +
            "e i criteri su cui sei piu' severo."}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={{ gap: theme.spacing[4] }}>
      <Text variant="label" uppercase color="secondary">
        I tuoi numeri
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[5] }}>
        <View style={{ gap: theme.spacing[1] }}>
          <Text variant="title">{stats.reviewCount}</Text>
          <Text variant="caption" color="secondary">
            {stats.reviewCount === 1 ? 'posto recensito' : 'posti recensiti'}
          </Text>
        </View>

        <View style={{ gap: theme.spacing[1], alignItems: 'flex-start' }}>
          <ScoreBadge score={stats.avgOverall} size="md" />
          <Text variant="caption" color="secondary">
            la tua media
          </Text>
        </View>

        <View style={{ gap: theme.spacing[1] }}>
          <Text variant="subheading">{formatCents(stats.avgCostPerPersonCents)}</Text>
          <Text variant="caption" color="secondary">
            a persona
          </Text>
        </View>
      </View>

      {stats.harshest || stats.kindest ? (
        <View style={{ gap: theme.spacing[2] }}>
          {stats.harshest ? (
            <CriterionLine label="Il tuo criterio piu' severo" value={stats.harshest} />
          ) : null}
          {stats.kindest ? (
            <CriterionLine label="Il tuo criterio piu' generoso" value={stats.kindest} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function CriterionLine({ label, value }: { label: string; value: CriterionAverage }) {
  const theme = useTheme();
  const meta = CRITERION_META[value.criterion];
  const color = theme.criterionColor(value.criterion);

  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${meta.label}, media ${formatScore(value.average)} su 10`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radii.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: color,
        }}
      >
        <Icon name={CRITERION_ICON[value.criterion]} size={16} color={color} />
      </View>
      <Text variant="caption" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={color}>
        {meta.label} {formatScore(value.average)}
      </Text>
    </View>
  );
}
