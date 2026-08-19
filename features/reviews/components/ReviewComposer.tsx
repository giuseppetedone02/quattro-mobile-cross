import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useTheme } from '@/theme';
import { CRITERIA, CRITERION_META, type Criterion } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/icons';
import {
  Button,
  Diamond,
  Field,
  PhotoPicker,
  ScoreBadge,
  ScoreDial,
  Text,
  TextArea,
  TextField,
} from '@/components/ui';
import { costPerPerson, formatCents, formatScore } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { MAX_PHOTOS_PER_REVIEW, pickPhotos } from '@/lib/photos';
import { overallScore } from '@/features/reviews/scoring';
import {
  COMMENT_MAX,
  amountFieldError,
  dateFieldError,
  emptyReviewForm,
  formatItalianDate,
  parseAmountToCents,
  parseItalianDate,
  parsePartySize,
  partyFieldError,
  progressiveScores,
  type ReviewFormValues,
  type ReviewPhotoDraft,
} from '@/features/reviews/schema';

export type ReviewComposerProps = {
  initial?: Partial<ReviewFormValues>;
  submitting?: boolean;
  onSubmit: (values: ReviewFormValues) => void;
};

const CRITERION_ICON: Record<Criterion, IconName> = {
  location: 'location',
  service: 'service',
  menu: 'menu',
  value: 'receipt',
};

const SUMMARY_STEP = CRITERIA.length;

/**
 * Il compositore 4+1: un criterio per passo, poi il riepilogo.
 *
 * Tutto lo stato vive qui e nessun passo lo scarta: tornare indietro mostra il
 * voto che avevi dato, non il valore di partenza. E' la ragione per cui i passi
 * sono una variabile e non quattro schermate di navigazione.
 */
export function ReviewComposer({ initial, submitting = false, onSubmit }: ReviewComposerProps) {
  const theme = useTheme();

  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Record<Criterion, number>>(() => ({
    ...emptyReviewForm().scores,
    ...initial?.scores,
  }));

  const [billRaw, setBillRaw] = useState(() =>
    initial?.billTotalCents != null
      ? (initial.billTotalCents / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [partyRaw, setPartyRaw] = useState(() =>
    initial?.partySize != null ? String(initial.partySize) : '',
  );
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [dateRaw, setDateRaw] = useState(() => formatItalianDate(initial?.visitedOn ?? null));
  const [photos, setPhotos] = useState<ReviewPhotoDraft[]>(initial?.photos ?? []);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const average = useMemo(() => overallScore(scores), [scores]);

  // Il diamante cresce: i criteri non ancora raggiunti valgono un valore
  // neutro, quindi la forma si allarga a ogni passo invece di apparire intera.
  const shownScores = useMemo(
    () => (step >= SUMMARY_STEP ? scores : progressiveScores(scores, step + 1)),
    [scores, step],
  );

  const billCents = parseAmountToCents(billRaw);
  const partySize = parsePartySize(partyRaw);
  const perPerson = costPerPerson(billCents, partySize);

  const billError = amountFieldError(billRaw);
  const partyError = partyFieldError(partyRaw);
  const dateError = dateFieldError(dateRaw);
  const commentError =
    comment.trim().length > COMMENT_MAX ? `Massimo ${COMMENT_MAX} caratteri.` : null;

  const addPhotos = async () => {
    setPhotoError(null);
    try {
      const picked = await pickPhotos(MAX_PHOTOS_PER_REVIEW - photos.length);
      setPhotos((current) => [
        ...current,
        ...picked.map((p) => ({
          id: Crypto.randomUUID(),
          uri: p.uri,
          width: p.width,
          height: p.height,
        })),
      ]);
    } catch (e) {
      setPhotoError(friendlyError(e).message);
    }
  };

  // Senza useCallback: i valori derivati dai campi cambiano a ogni battuta,
  // memoizzare a mano qui impedirebbe al React Compiler di ottimizzare il
  // componente e non risparmierebbe nulla.
  const publish = () => {
    if (billError || partyError || dateError || commentError) return;
    onSubmit({
      scores,
      billTotalCents: billCents,
      partySize,
      comment: comment.trim(),
      visitedOn: dateRaw.trim() === '' ? null : parseItalianDate(dateRaw),
      photos,
    });
  };

  if (step < SUMMARY_STEP) {
    const criterion = CRITERIA[step] as Criterion;
    const meta = CRITERION_META[criterion];

    return (
      <View style={{ gap: theme.spacing[5] }}>
        <StepDots current={step} />

        <View style={{ gap: theme.spacing[2] }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
            <Icon
              name={CRITERION_ICON[criterion]}
              size={20}
              color={theme.criterionColor(criterion)}
            />
            <Text variant="label" uppercase color={theme.criterionColor(criterion)}>
              {meta.label}
            </Text>
          </View>
          <Text variant="heading">{meta.question}</Text>
          <Text variant="caption" color="secondary">
            {meta.hint}
          </Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Diamond scores={shownScores} scale="compact" size={160} />
        </View>

        <ScoreDial
          criterion={criterion}
          value={scores[criterion]}
          onChange={(value) => setScores((current) => ({ ...current, [criterion]: value }))}
        />

        <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
          {step > 0 ? (
            <Button
              label="Indietro"
              variant="secondary"
              icon="chevronLeft"
              onPress={() => setStep((s) => s - 1)}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button
            label="Avanti"
            iconRight="chevronRight"
            onPress={() => setStep((s) => s + 1)}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing[5] }}>
      <StepDots current={SUMMARY_STEP} />

      <Text variant="heading">Riepilogo</Text>

      <View style={{ alignItems: 'center', gap: theme.spacing[3] }}>
        <Diamond scores={scores} scale="hero" showLabels />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
          <ScoreBadge score={average} size="lg" />
          <Text variant="caption" color="secondary">
            La tua media su {CRITERIA.length} criteri: {formatScore(average)}
          </Text>
        </View>
      </View>

      {/*
        Importo e coperti sono FACOLTATIVI (decisione 22.2): il criterio "Conto"
        e' il voto da 1 a 10 che hai gia' dato, questi due campi sono solo un
        promemoria di quanto hai speso. Niente qui blocca la pubblicazione.
      */}
      <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
        <TextField
          label="Totale (facoltativo)"
          prefix="EUR"
          value={billRaw}
          onChangeText={setBillRaw}
          error={billError}
          placeholder="0,00"
          keyboardType="decimal-pad"
          containerStyle={{ flex: 1 }}
        />
        <TextField
          label="In quanti (facoltativo)"
          value={partyRaw}
          onChangeText={setPartyRaw}
          error={partyError}
          placeholder="2"
          keyboardType="number-pad"
          containerStyle={{ flex: 1 }}
        />
      </View>

      {perPerson != null ? (
        <Text variant="bodyStrong" color="secondary" accessibilityLiveRegion="polite">
          {formatCents(perPerson)} a persona
        </Text>
      ) : null}

      <TextArea
        label="Commento (facoltativo)"
        value={comment}
        onChangeText={setComment}
        error={commentError}
        placeholder="Com'e' andata?"
        hint={`Massimo ${COMMENT_MAX} caratteri.`}
      />

      <TextField
        label="Quando ci sei stato (facoltativo)"
        value={dateRaw}
        onChangeText={setDateRaw}
        error={dateError}
        placeholder="GG/MM/AAAA"
        keyboardType="numbers-and-punctuation"
      />

      <Field label="Foto (facoltative)" error={photoError}>
        <PhotoPicker
          photos={photos}
          onAdd={() => void addPhotos()}
          onRemove={(id) => setPhotos((current) => current.filter((p) => p.id !== id))}
          disabled={submitting}
        />
      </Field>

      <View style={{ gap: theme.spacing[3] }}>
        <Button
          label="Pubblica la recensione"
          icon="check"
          onPress={publish}
          loading={submitting}
          disabled={submitting}
          full
        />
        <Button
          label="Indietro"
          variant="secondary"
          icon="chevronLeft"
          onPress={() => setStep(SUMMARY_STEP - 1)}
          disabled={submitting}
          full
        />
      </View>
    </View>
  );
}

/** Quattro pallini piu' il riepilogo: dice dove sei senza occupare spazio. */
function StepDots({ current }: { current: number }) {
  const theme = useTheme();
  const total = CRITERIA.length;
  const label =
    current >= total ? 'Riepilogo della recensione' : `Passo ${current + 1} di ${total}`;

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}
    >
      {CRITERIA.map((criterion, index) => (
        <View
          key={criterion}
          style={{
            width: index === current ? 22 : 8,
            height: 8,
            borderRadius: theme.radii.full,
            backgroundColor:
              index <= current ? theme.criterionColor(criterion) : theme.colors.bgRaised,
          }}
        />
      ))}
      <Text variant="label" uppercase color="secondary" style={{ marginLeft: theme.spacing[2] }}>
        {label}
      </Text>
    </View>
  );
}
