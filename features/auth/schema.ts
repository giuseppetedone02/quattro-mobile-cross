import { z } from 'zod';

/**
 * Il formato dello username deve corrispondere ESATTAMENTE al CHECK constraint
 * di Postgres:
 *   username ~ '^[a-z0-9](?:[a-z0-9_.]{1,18}[a-z0-9])$'
 * Se divergono, l'utente vede "libero" e poi un errore al salvataggio.
 */
export const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9_.]{1,18}[a-z0-9])$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN, `Almeno ${USERNAME_MIN} caratteri.`)
  .max(USERNAME_MAX, `Massimo ${USERNAME_MAX} caratteri.`)
  .regex(
    USERNAME_REGEX,
    'Solo lettere minuscole, numeri, punto e underscore. Non puo iniziare o finire con punto o underscore.',
  );

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Email non valida.'));

export const passwordSchema = z
  .string()
  .min(8, 'Almeno 8 caratteri.')
  .max(72, 'Massimo 72 caratteri.');

export const signUpSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Inserisci la password.'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/** Valida un singolo campo restituendo il primo messaggio, per il feedback dal vivo. */
export function fieldError(schema: z.ZodType<unknown>, value: unknown): string | null {
  const result = schema.safeParse(value);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'Valore non valido.';
}
