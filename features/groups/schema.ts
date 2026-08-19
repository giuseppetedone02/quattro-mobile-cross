import { z } from 'zod';

/**
 * I limiti rispecchiano ESATTAMENTE i CHECK constraint di Postgres:
 *   name        char_length(name) between 1 and 60
 *   description description is null or char_length(description) <= 500
 * Se divergessero, l'utente vedrebbe il campo "valido" e poi un errore al
 * salvataggio -- lo stesso difetto che la validazione dello username evita.
 */
export const GROUP_NAME_MIN = 1;
export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 500;

export const groupNameSchema = z
  .string()
  .trim()
  .min(GROUP_NAME_MIN, 'Dai un nome al gruppo.')
  .max(GROUP_NAME_MAX, `Massimo ${GROUP_NAME_MAX} caratteri.`);

export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(GROUP_DESCRIPTION_MAX, `Massimo ${GROUP_DESCRIPTION_MAX} caratteri.`);

export const groupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema.optional(),
});

export type GroupFormValues = z.infer<typeof groupSchema>;

/** Primo messaggio d'errore di un singolo campo, per il feedback dal vivo. */
export function firstError(schema: z.ZodType<unknown>, value: unknown): string | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'Valore non valido.';
}
