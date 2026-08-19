import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Button, ErrorState, PhotoPicker, TextArea, TextField } from '@/components/ui';
import { pickPhotos, type PreparedPhoto } from '@/lib/photos';
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  firstError,
  groupDescriptionSchema,
  groupNameSchema,
  groupSchema,
} from '../schema';

export type GroupFormSubmit = {
  name: string;
  description: string | null;
  /** Nuova immagine da caricare, se l'utente ne ha scelta una. */
  photo: PreparedPhoto | null;
  /** true = l'utente ha rimosso l'immagine esistente. */
  removeImage: boolean;
};

export type GroupFormProps = {
  initial?: { name?: string; description?: string | null; imageUri?: string | null };
  onSubmit: (values: GroupFormSubmit) => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Errore del salvataggio, gia' passato da friendlyError. */
  error?: string | null;
};

/**
 * Form di creazione e modifica di un gruppo. Un solo componente per entrambi:
 * la differenza fra i due casi e' solo `initial` e l'etichetta del bottone.
 */
export function GroupForm({
  initial,
  onSubmit,
  submitting = false,
  submitLabel = 'Salva',
  error,
}: GroupFormProps) {
  const theme = useTheme();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(initial?.imageUri ?? null);
  const [touched, setTouched] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const nameError = touched ? firstError(groupNameSchema, name) : null;
  const descriptionError = firstError(groupDescriptionSchema, description);
  const valid = groupSchema.safeParse({ name, description }).success;

  const shownPhoto = photo?.uri ?? existingImage;

  async function handleAdd() {
    setPickError(null);
    try {
      const picked = await pickPhotos(1);
      const first = picked[0];
      if (first) {
        setPhoto(first);
        setExistingImage(null);
      }
    } catch (e) {
      setPickError(e instanceof Error ? e.message : "Non e' stato possibile aprire le foto.");
    }
  }

  function handleRemove() {
    setPhoto(null);
    setExistingImage(null);
  }

  function handleSubmit() {
    setTouched(true);
    if (!valid) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      photo,
      removeImage: !photo && !existingImage && Boolean(initial?.imageUri),
    });
  }

  return (
    <View style={{ gap: theme.spacing[5] }}>
      <TextField
        label="Nome del gruppo"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setTouched(true);
        }}
        placeholder="Pizze del giovedi"
        maxLength={GROUP_NAME_MAX}
        error={nameError}
        hint={`${name.trim().length}/${GROUP_NAME_MAX}`}
        autoCapitalize="sentences"
        returnKeyType="next"
      />

      <TextArea
        label="Descrizione"
        value={description}
        onChangeText={setDescription}
        placeholder="Di cosa si occupa questo gruppo? (facoltativo)"
        maxLength={GROUP_DESCRIPTION_MAX}
        error={descriptionError}
        hint={`${description.trim().length}/${GROUP_DESCRIPTION_MAX}`}
      />

      <View style={{ gap: theme.spacing[2] }}>
        <PhotoPicker
          photos={shownPhoto ? [{ id: 'group-image', uri: shownPhoto }] : []}
          onAdd={() => void handleAdd()}
          onRemove={handleRemove}
          max={1}
          disabled={submitting}
        />
        {pickError ? <ErrorState message={pickError} compact /> : null}
      </View>

      {error ? <ErrorState message={error} compact /> : null}

      <Button
        label={submitLabel}
        onPress={handleSubmit}
        loading={submitting}
        disabled={!valid || submitting}
        full
      />
    </View>
  );
}
