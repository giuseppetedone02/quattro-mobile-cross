import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/layout';
import {
  Avatar, Button, Card, ErrorState, IconButton, LoadingState, PressScale, Text, TextField,
} from '@/components/ui';
import { StatsPanel, ThemeGallery, useUpdateProfile, useUpdateUsername } from '@/features/profile';
import { useMyStats } from '@/features/reviews';
import { useProfile, useSupabaseSession } from '@/features/auth/hooks/useSession';
import { useSignOut, useUsernameAvailability } from '@/features/auth/hooks/useAuthActions';
import { BUCKETS, pickPhotos, publicUrl } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import { useTheme } from '@/theme';

export default function ProfileTab() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSupabaseSession();
  const userId = session?.user.id;

  const profile = useProfile(userId);
  const stats = useMyStats(userId);
  const updateProfile = useUpdateProfile();
  const updateUsername = useUpdateUsername();
  const signOut = useSignOut();

  const [editingUsername, setEditingUsername] = useState(false);
  const [nextUsername, setNextUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

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

        <Card>
          <ThemeGallery />
        </Card>

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
      </View>
    </Screen>
  );
}
