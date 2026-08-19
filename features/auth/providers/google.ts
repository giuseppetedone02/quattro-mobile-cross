import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

/**
 * ISOLAMENTO DELIBERATO.
 *
 * Il pacchetto npm gratuito @react-native-google-signin/google-signin (16.x)
 * e' ora il tier legacy: la sua documentazione lo descrive come costruito
 * sull'SDK Android Google Sign-In deprecato, e il supporto ad Android
 * Credential Manager e' passato al tier a pagamento. Google dichiara che il
 * Sign-In legacy "will be removed in a future release", senza data.
 *
 * Funziona oggi ed e' quello documentato da Supabase. Ma tutto cio' che lo
 * riguarda vive in questo file, ~50 righe: sostituirlo (con
 * react-native-nitro-google-signin o altro) e' una giornata, non una
 * settimana.
 */

let configured = false;

export function configureGoogleSignIn() {
  if (configured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error(
      'Manca EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. E il client ID WEB che emette ' +
        "l'idToken verificato da Supabase, non quello Android o iOS.",
    );
  }

  GoogleSignin.configure({
    webClientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    // Nessuno scope aggiuntivo: serve solo l'identita.
    scopes: [],
  });
  configured = true;
}

export type GoogleSignInOutcome =
  | { kind: 'success' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * Sul nonce: Supabase valida il nonce per default. La libreria ne genera uno
 * internamente quando non gliene passiamo uno, quindi questo flusso funziona
 * senza gestione esplicita. Se un giorno servisse legarlo, va passato
 * HASHATO in SHA-256 a Google e GREZZO a supabase.auth.signInWithIdToken:
 * scambiarli produce l'errore "Nonces mismatch".
 */
export async function signInWithGoogle(): Promise<GoogleSignInOutcome> {
  configureGoogleSignIn();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) return { kind: 'cancelled' };

    const idToken = response.data.idToken;
    if (!idToken) {
      return {
        kind: 'error',
        message:
          "Google non ha restituito un token di identita. Verifica che il client ID WEB sia configurato e registrato in Supabase.",
      };
    }

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) return { kind: 'error', message: error.message };

    return { kind: 'success' };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { kind: 'cancelled' };
      if (e.code === statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { kind: 'error', message: 'Google Play Services non disponibile su questo dispositivo.' };
      }
    }
    return {
      kind: 'error',
      message:
        e instanceof Error
          ? e.message
          : 'Accesso con Google non riuscito. Controlla la connessione e riprova.',
    };
  }
}

export async function signOutGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Non bloccante: il logout Supabase e' quello che conta.
  }
}
