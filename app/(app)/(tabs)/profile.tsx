import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import {
  Avatar,
  Button,
  Card,
  ErrorState,
  IconButton,
  LoadingState,
  PressScale,
  Text,
  TextField,
} from '@/components/ui';
import {
  GroupLeaderboardCard,
  StatsPanel,
  ThemeGallery,
  useCancelAccountDeletion,
  useRequestAccountDeletion,
  useUpdateProfile,
  useUpdateUsername,
} from '@/features/profile';
import { useGroupLeaderboard, useMyStats } from '@/features/reviews';
import { useProfile, useSupabaseSession } from '@/features/auth/hooks/useSession';
import { useSignOut, useUsernameAvailability } from '@/features/auth/hooks/useAuthActions';
import { useActiveGroupResolved } from '@/lib/useActiveGroupResolved';
import { BUCKETS, pickPhotos, publicUrl } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';

const DELETION_GRACE_DAYS = 30;

function deletionCompletesOn(requestedAt: string): string {
  const ms = new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return formatDate(new Date(ms).toISOString(), 'long');
}

export default function ProfileTab() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSupabaseSession();
  const userId = session?.user.id;

  const profile = useProfile(userId);
  const stats = useMyStats(userId);
  const { active } = useActiveGroupResolved();
  // Solo per un gruppo condiviso: in quello personale la classifica sarebbe
  // sempre "tu, unico membro" -- un dato senza contenuto informativo.
  const showLeaderboard = Boolean(active) && !active?.group.is_personal;
  const leaderboard = useGroupLeaderboard(showLeaderboard ? active?.group.id : undefined);
  const updateProfile = useUpdateProfile();
  const updateUsername = useUpdateUsername();
  const signOut = useSignOut();
  const requestDeletion = useRequestAccountDeletion();
  const cancelDeletion = useCancelAccountDeletion();

  const [editingUsername, setEditingUsername] = useState(false);
  const [nextUsername, setNextUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  async function confirmDeleteAccount() {
    setDeletionError(null);
    try {
      await requestDeletion.mutateAsync();
      setConfirmingDeletion(false);
    } catch (e) {
      setDeletionError(friendlyError(e, 'profiles').message);
    }
  }

  async function undoDeleteAccount() {
    setDeletionError(null);
    try {
      await cancelDeletion.mutateAsync();
    } catch (e) {
      setDeletionError(friendlyError(e, 'profiles').message);
    }
  }

  const check = useUsernameAvailability(editingUsername ? nextUsername : '');

  async function changeAvatar() {
    setError(null);
    try {
      const [photo] = await pickPhotos(1);
      if (!photo) return;
      await updateProfile.mutateAsync({ photo });
    } catch (e) {
      setError(friendlyError(e).message);
    }
  }

  async function saveUsername() {
    setError(null);
    try {
      await updateUsername.mutateAsync({ username: nextUsername.trim().toLowerCase() });
      setEditingUsername(false);
      setNextUsername('');
    } catch (e) {
      setError(friendlyError(e, 'profiles').message);
    }
  }

  if (profile.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const p = profile.data;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing[5], paddingTop: theme.spacing[2] }}>
        <View style={{ alignItems: 'center', gap: theme.spacing[3] }}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel="Cambia la foto profilo"
            onPress={() => void changeAvatar()}
          >
            <Avatar
              uri={publicUrl(BUCKETS.avatars, p?.avatar_path)}
              name={p?.display_name ?? p?.username}
              seed={p?.id}
              size={96}
            />
          </PressScale>

          {updateProfile.isPending ? (
            <Text variant="caption" color="secondary" accessibilityLiveRegion="polite">
              Carico la foto...
            </Text>
          ) : null}

          {editingUsername ? (
            <View style={{ width: '100%', gap: theme.spacing[3] }}>
              <TextField
                label="Nuovo username"
                prefix="@"
                value={nextUsername}
                onChangeText={(v) => setNextUsername(v.toLowerCase())}
                autoCapitalize="none"
                autoFocus
                error={
                  check.state === 'invalid'
                    ? check.message
                    : check.state === 'taken'
                      ? 'Gia in uso.'
                      : null
                }
                success={check.state === 'available' ? 'Libero' : null}
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                <Button
                  label="Salva"
                  disabled={check.state !== 'available'}
                  loading={updateUsername.isPending}
                  onPress={() => void saveUsername()}
                />
                <Button
                  label="Annulla"
                  variant="ghost"
                  onPress={() => {
                    setEditingUsername(false);
                    setNextUsername('');
                  }}
                />
              </View>
            </View>
          ) : (
            // Riga a tre colonne (spaziatore · username · matita) invece di
            // un semplice row centrato: con solo due elementi la matita
            // spostava il centro visivo dello username a sinistra rispetto
            // all'avatar sopra. Lo spaziatore a sinistra, della stessa
            // larghezza della matita, tiene lo username davvero centrato.
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ width: 36 }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="heading">@{p?.username ?? '...'}</Text>
                {p?.display_name ? (
                  <Text variant="caption" color="secondary">
                    {p.display_name}
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="edit"
                accessibilityLabel="Modifica lo username"
                size={36}
                onPress={() => {
                  setNextUsername(p?.username ?? '');
                  setEditingUsername(true);
                }}
              />
            </View>
          )}

          {error ? <ErrorState compact message={error} /> : null}
        </View>

        <StatsPanel
          loading={stats.isLoading}
          stats={
            stats.data
              ? {
                  reviewCount: stats.data.totalReviews,
                  avgOverall: stats.data.averageOverall,
                  avgCostPerPersonCents: stats.data.averageCostPerPersonCents,
                  harshest: stats.data.harshest,
                  kindest: stats.data.kindest,
                }
              : null
          }
        />

        {showLeaderboard ? (
          <GroupLeaderboardCard
            groupName={active?.group.name ?? ''}
            leaderboard={leaderboard.data}
            loading={leaderboard.isLoading}
          />
        ) : null}

        <Card>
          <ThemeGallery />
        </Card>

        {p?.deletion_requested_at ? (
          <Card
            elevation={0}
            style={{ backgroundColor: theme.colors.bgRaised, gap: theme.spacing[2] }}
          >
            <Text variant="bodyStrong">
              Il tuo account verra eliminato il {deletionCompletesOn(p.deletion_requested_at)}.
            </Text>
            {deletionError ? <ErrorState compact message={deletionError} /> : null}
            <Button
              label="Annulla eliminazione"
              variant="ghost"
              loading={cancelDeletion.isPending}
              onPress={() => void undoDeleteAccount()}
            />
          </Card>
        ) : null}

        <Button
          label="Esci"
          variant="danger"
          icon="logout"
          full
          loading={signOut.isPending}
          onPress={async () => {
            await signOut.mutateAsync();
            router.replace('/welcome');
          }}
        />

        {!p?.deletion_requested_at ? (
          confirmingDeletion ? (
            <Card elevation={0} style={{ gap: theme.spacing[2] }}>
              <Text variant="bodyStrong">Eliminare questo account?</Text>
              <Text variant="caption" color="secondary">
                Il tuo account verra disattivato subito e cancellato in modo definitivo dopo{' '}
                {DELETION_GRACE_DAYS} giorni. Puoi annullare in qualsiasi momento entro quella data.
              </Text>
              {deletionError ? <ErrorState compact message={deletionError} /> : null}
              <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
                <Button
                  label="Conferma eliminazione"
                  variant="danger"
                  loading={requestDeletion.isPending}
                  onPress={() => void confirmDeleteAccount()}
                />
                <Button
                  label="Annulla"
                  variant="ghost"
                  onPress={() => {
                    setConfirmingDeletion(false);
                    setDeletionError(null);
                  }}
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Elimina account"
              variant="ghost"
              icon="trash"
              full
              onPress={() => setConfirmingDeletion(true)}
            />
          )
        ) : null}
      </View>
    </Screen>
  );
}
