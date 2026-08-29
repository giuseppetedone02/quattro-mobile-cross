import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useTheme } from '@/theme';
import { Icon } from '@/components/icons';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  PhotoPicker,
  Text,
  TextArea,
  TextField,
} from '@/components/ui';
import { pickPhotos } from '@/lib/photos';
import { friendlyError } from '@/lib/errors';
import { useCuisineOptions } from '@/features/places/hooks/usePlaces';
import type { GooglePlaceDetails } from '@/features/places/api/googlePlaces';
import {
  NOTES_MAX,
  emptyPlaceForm,
  validatePlaceForm,
  type PlaceFormErrors,
  type PlaceFormValues,
} from '@/features/places/schema';

export type PlaceFormGroup = { id: string; name: string; isPersonal: boolean };

export type PlaceFormProps = {
  initial?: Partial<PlaceFormValues>;
  groups: PlaceFormGroup[];
  defaultGroupId: string;
  /** Se presente, i campi arrivano precompilati da Google Maps. */
  googleSource?: GooglePlaceDetails | null;
  submitting?: boolean;
  onSubmit: (values: PlaceFormValues) => void;
};

/**
 * L'UNICO form di inserimento posto: i due percorsi -- scelta da Google e
 * inserimento a mano -- convergono qui, uno precompilato e uno vuoto.
 *
 * Non e' solo economia di codice, e' il punto giuridico del progetto: cio' che
 * finisce in `places.name` e `places.address` non e' una copia dei dati Google
 * ma un valore che l'utente ha visto, potuto cambiare e confermato. Il
 * collegamento alla scheda ufficiale resta `google_place_id`, e valutazione,
 * orari e foto si leggono a runtime.
 */
export function PlaceForm({
  initial,
  groups,
  defaultGroupId,
  googleSource = null,
  submitting = false,
  onSubmit,
}: PlaceFormProps) {
  const theme = useTheme();

  const [values, setValues] = useState<PlaceFormValues>(() => ({
    ...emptyPlaceForm(defaultGroupId),
    ...initial,
    groupId: initial?.groupId ?? defaultGroupId,
  }));
  const [errors, setErrors] = useState<PlaceFormErrors>({});
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Suggerimenti per il campo "cucina": i valori gia' usati nel gruppo
  // selezionato, per ridurre i doppioni ovvi ("pizzeria"/"Pizzeria") senza
  // trasformarlo in un elenco chiuso -- si puo' sempre scrivere un valore
  // nuovo. Filtrati sul testo digitato ed esclude cio' che e' gia' scritto.
  const cuisineOptions = useCuisineOptions(values.groupId);
  const cuisineSuggestions = useMemo(() => {
    const query = values.cuisine.trim().toLowerCase();
    return cuisineOptions
      .filter((c) => c.toLowerCase() !== query)
      .filter((c) => !query || c.toLowerCase().includes(query))
      .slice(0, 6);
  }, [cuisineOptions, values.cuisine]);

  const patch = useCallback(
    <K extends keyof PlaceFormValues>(key: K, value: PlaceFormValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    },
    [],
  );

  const addPhoto = useCallback(async () => {
    setPhotoError(null);
    try {
      const picked = await pickPhotos(1);
      const first = picked[0];
      if (!first) return;
      setValues((current) => ({
        ...current,
        coverPhoto: {
          id: Crypto.randomUUID(),
          uri: first.uri,
          width: first.width,
          height: first.height,
        },
      }));
    } catch (e) {
      setPhotoError(friendlyError(e).message);
    }
  }, []);

  const submit = useCallback(() => {
    const found = validatePlaceForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({
      ...values,
      name: values.name.trim(),
      address: values.address.trim(),
      cuisine: values.cuisine.trim(),
      notes: values.notes.trim(),
    });
  }, [onSubmit, values]);

  return (
    <View style={{ gap: theme.spacing[5] }}>
      {googleSource ? <GoogleAttribution details={googleSource} /> : null}

      <TextField
        label="Nome"
        value={values.name}
        onChangeText={(v) => patch('name', v)}
        error={errors.name}
        placeholder="Come si chiama?"
        autoCapitalize="words"
        returnKeyType="next"
      />

      <TextField
        label="Indirizzo"
        value={values.address}
        onChangeText={(v) => patch('address', v)}
        error={errors.address}
        placeholder="Via, numero, citta'"
        autoCapitalize="sentences"
      />

      <View style={{ gap: theme.spacing[2] }}>
        <TextField
          label="Cucina"
          value={values.cuisine}
          onChangeText={(v) => patch('cuisine', v)}
          error={errors.cuisine}
          placeholder="Pizzeria, trattoria, sushi..."
          autoCapitalize="sentences"
        />
        {cuisineSuggestions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: theme.spacing[2] }}
          >
            {cuisineSuggestions.map((c) => (
              <Chip key={c} label={c} onPress={() => patch('cuisine', c)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <TextArea
        label="Note"
        value={values.notes}
        onChangeText={(v) => patch('notes', v)}
        error={errors.notes}
        hint={`Cosa vuoi ricordarti di questo posto. Massimo ${NOTES_MAX} caratteri.`}
        placeholder="Chiuso il lunedi', chiedere il tavolo in fondo..."
      />

      <Field label="Foto di copertina" error={photoError} hint="Una sola, la puoi cambiare dopo.">
        <PhotoPicker
          photos={values.coverPhoto ? [values.coverPhoto] : []}
          onAdd={() => void addPhoto()}
          onRemove={() => patch('coverPhoto', null)}
          max={1}
          disabled={submitting}
        />
      </Field>

      <GroupSelector
        groups={groups}
        selectedId={values.groupId}
        error={errors.groupId}
        onSelect={(id) => patch('groupId', id)}
      />

      <Button
        label="Salva e recensisci"
        icon="check"
        onPress={submit}
        loading={submitting}
        disabled={submitting}
        full
      />
    </View>
  );
}

/**
 * Selettore di gruppo come fila di chip scorrevole: su mobile e' preferibile a
 * una dropdown -- si vedono le opzioni e si sceglie con un tocco solo.
 */
function GroupSelector({
  groups,
  selectedId,
  error,
  onSelect,
}: {
  groups: PlaceFormGroup[];
  selectedId: string;
  error?: string;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();

  if (groups.length === 0) {
    return <ErrorState message="Non hai gruppi in cui salvare questo posto." compact />;
  }

  return (
    <Field
      label="In quale gruppo"
      error={error}
      hint="Puoi aggiungerlo ad altri gruppi piu' tardi."
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: theme.spacing[2], paddingRight: theme.spacing[4] }}
      >
        {groups.map((group) => (
          <Chip
            key={group.id}
            // Il nome vero, non un'etichetta fissa: il gruppo personale si
            // puo' rinominare, e qui deve comparire il nome scelto.
            label={group.name}
            icon={group.isPersonal ? 'user' : 'users'}
            selected={group.id === selectedId}
            onPress={() => onSelect(group.id)}
          />
        ))}
      </ScrollView>
    </Field>
  );
}

/** Attribuzione obbligatoria + promessa esplicita che i valori sono modificabili. */
function GoogleAttribution({ details }: { details: GooglePlaceDetails }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing[2], backgroundColor: theme.colors.bgRaised }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Icon name="google" size={16} color={theme.colors.textSecondary} />
        <Text variant="label" uppercase color="secondary">
          Da Google Maps
        </Text>
      </View>
      <Text variant="caption" color="secondary">
        {`Nome e indirizzo arrivano dalla scheda ufficiale di ${
          details.displayName || 'Google Maps'
        }. Correggili come vuoi: quello che salvi e' tuo.`}
      </Text>
    </Card>
  );
}
