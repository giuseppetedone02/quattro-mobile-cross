/**
 * purge-deleted-accounts - cancellazione definitiva degli account in grace
 * period da piu' di 30 giorni (requisito 1.3, GDPR).
 *
 * Invocata ogni notte da pg_cron via pg_net (vedi migrazione 0015), non
 * dall'app: nessun utente deve poter chiamarla, per questo l'autenticazione
 * e' un segreto condiviso (x-webhook-secret) invece di un JWT, stesso
 * meccanismo di notify-invite. Deploy con --no-verify-jwt.
 *
 * PERCHE' la cancellazione vera sta qui e non in una funzione SQL chiamata
 * direttamente dal cron: le installazioni recenti di Supabase Storage hanno
 * un trigger (storage.protect_delete) che rifiuta qualunque "delete from
 * storage.objects" fatto da SQL puro -- cascade da auth.users compreso, con
 * errore 42501. L'unico modo di rimuovere un file per davvero (blob nel
 * backend S3-compatibile, non solo la riga di metadati) e' la Storage API
 * vera, che da SQL non e' raggiungibile. Ordine OBBLIGATORIO: prima i file
 * (storage.from(bucket).remove), poi l'utente (auth.admin.deleteUser) --
 * al contrario, il cascade su auth.users proverebbe a cancellare le righe di
 * storage.objects rimaste e verrebbe rifiutato dallo stesso trigger.
 *
 * Un utente alla volta, in un solo giro: se la rimozione dei file di un
 * utente fallisce, quell'utente viene saltato (si riprova la notte dopo) ma
 * gli altri proseguono -- un problema isolato non deve bloccare l'intero lotto.
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import { serviceClient, toErrorResponse, HttpError } from '../_shared/auth.ts';

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Variabile d'ambiente ${name} non configurata.`);
  return value;
}

/** Stesso schema di notify-invite: nessun JWT qui, solo un segreto condiviso. */
function assertCronSecret(req: Request): void {
  const expected = requiredEnv('PURGE_CRON_SECRET');
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (provided !== expected) throw new HttpError(401, 'Chiamata non autorizzata.');
}

type StorageObjectRef = { bucket_id: string; name: string };

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');
    assertCronSecret(req);

    const db = serviceClient();

    const eligible = await db.rpc('accounts_ready_for_purge');
    if (eligible.error) throw new HttpError(500, eligible.error.message);

    const userIds = (eligible.data ?? []) as string[];
    const purged: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];

    for (const userId of userIds) {
      const objects = await db.rpc('storage_objects_pending_purge', { p_user_id: userId });
      if (objects.error) {
        skipped.push({ userId, reason: objects.error.message });
        continue;
      }

      const byBucket = new Map<string, string[]>();
      for (const row of (objects.data ?? []) as StorageObjectRef[]) {
        const list = byBucket.get(row.bucket_id) ?? [];
        list.push(row.name);
        byBucket.set(row.bucket_id, list);
      }

      let storageOk = true;
      for (const [bucket, paths] of byBucket) {
        if (paths.length === 0) continue;
        const removed = await db.storage.from(bucket).remove(paths);
        if (removed.error) {
          storageOk = false;
          skipped.push({ userId, reason: `storage(${bucket}): ${removed.error.message}` });
          break;
        }
      }
      if (!storageOk) continue;

      // Solo ora, con nessun file residuo: il cascade su profiles/groups/
      // reviews/inviti (vedi 0002) non tocca piu' storage.objects.
      const deleted = await db.auth.admin.deleteUser(userId);
      if (deleted.error) {
        skipped.push({ userId, reason: `auth.deleteUser: ${deleted.error.message}` });
        continue;
      }

      purged.push(userId);
    }

    if (skipped.length > 0) console.error('purge-deleted-accounts: saltati', skipped);

    return json({ purged: purged.length, skipped: skipped.length });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
