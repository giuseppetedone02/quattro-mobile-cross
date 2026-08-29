/**
 * places-photo - risolve un photo name di Google Places in una URL scaricabile.
 *
 * DUE VINCOLI DELL'API CHE DETTANO IL COMPORTAMENTO DEL CLIENT.
 *
 * 1. NIENTE CACHE, NE' QUI NE' NEL DATABASE.
 *    La documentazione di Places API (New) e' esplicita: "Photo names cannot
 *    be cached and may expire". Vale sia per il photo name che arriva da
 *    places-details, sia per il photoUri restituito qui, che e' un link
 *    firmato a scadenza breve. Memorizzarli produce immagini rotte a
 *    distanza di ore, con un bug che non si riproduce mai subito.
 *    Se una foto serve in modo permanente (per esempio la copertina di un
 *    luogo), va SCARICATA e ricaricata su Supabase Storage: quella e' una
 *    copia nostra, non un riferimento scaduto.
 *
 * 2. IL 429 QUI SIGNIFICA "TROPPE RICHIESTE CONTEMPORANEE", non "hai
 *    superato la quota giornaliera". Google limita le richieste di media in
 *    parallelo: una griglia che monta dieci <Image> insieme lo prende
 *    sistematicamente. Per questo il client deve caricare le foto in modo
 *    LAZY, una alla volta quando entrano nel viewport, e non risolvere tutti
 *    i photoNames in un Promise.all.
 *
 * skipHttpRedirect=true fa tornare un JSON con photoUri invece di un 302:
 * serve perche' l'app deve poter passare l'URL a <Image> senza seguire il
 * redirect a mano.
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import { requireUser, toErrorResponse, HttpError } from '../_shared/auth.ts';
import { consumeToken } from '../_shared/rateLimit.ts';

const DEFAULT_MAX_WIDTH_PX = 800;
const MIN_MAX_WIDTH_PX = 100;
/** Limite dell'API Places: oltre 4800 px la richiesta viene rifiutata. */
const MAX_MAX_WIDTH_PX = 4800;

type PhotoMediaResponse = { name?: string; photoUri?: string };

function clampWidth(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_WIDTH_PX;
  return Math.min(MAX_MAX_WIDTH_PX, Math.max(MIN_MAX_WIDTH_PX, parsed));
}

/**
 * Un photo name ha la forma "places/{placeId}/photos/{photoReference}".
 * Il controllo serve a non trasformare la funzione in un proxy verso
 * qualunque path di googleapis.com.
 */
function isValidPhotoName(name: string): boolean {
  return /^places\/[A-Za-z0-9_\-]+\/photos\/[A-Za-z0-9_\-]+$/.test(name);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    // POST con corpo JSON, come le altre due Edge Function di questo
    // progetto: supabase.functions.invoke() del client manda SEMPRE il
    // corpo, mai una query string. La versione precedente leggeva
    // photoName/maxWidthPx da url.searchParams e richiedeva GET: il client
    // non li ha mai mandati li', quindi ogni richiesta falliva con 400
    // ("Manca il photoName").
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');

    const caller = await requireUser(req);

    // Bucket piu' stretto delle altre due funzioni: e' l'unica SKU di
    // Places API (New) non coperta dalla soglia gratuita mensile (vedi
    // commento in cima a rateLimit.ts). 20 foto, poi una ogni 3 secondi:
    // sufficiente per scorrere una galleria a mano, stretto per un ciclo
    // impazzito che monta tutte le foto insieme.
    if (
      !consumeToken(caller.userId, { scope: 'places-photo', capacity: 20, refillPerSecond: 1 / 3 })
    ) {
      throw new HttpError(429, 'Troppe foto richieste. Riprova fra qualche secondo.');
    }

    const raw = (await req.json().catch(() => ({}))) as {
      photoName?: unknown;
      maxWidthPx?: unknown;
    };
    const photoName = typeof raw.photoName === 'string' ? raw.photoName.trim() : '';
    if (!photoName) throw new HttpError(400, 'Manca il photoName.');
    if (!isValidPhotoName(photoName)) throw new HttpError(400, 'photoName non valido.');

    const maxWidthPx = clampWidth(
      typeof raw.maxWidthPx === 'number' ? String(raw.maxWidthPx) : null,
    );

    const apiKey = Deno.env.get('GOOGLE_PLACES_KEY');
    if (!apiKey) throw new HttpError(500, 'Foto non disponibili in questo momento.');

    const target =
      `https://places.googleapis.com/v1/${photoName}/media` +
      `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;

    const response = await fetch(target, {
      method: 'GET',
      headers: { 'X-Goog-Api-Key': apiKey },
    });

    // Vedi punto 2: il 429 va rimandato al client come 429, cosi' che possa
    // riprovare la singola foto piu' tardi invece di considerarla mancante.
    if (response.status === 429) {
      throw new HttpError(429, 'Troppe foto richieste insieme. Riprova fra poco.');
    }
    if (!response.ok) {
      console.error('places:photo', response.status, await response.text());
      throw new HttpError(502, 'Non ho potuto caricare la foto.');
    }

    const data = (await response.json()) as PhotoMediaResponse;
    if (!data.photoUri) throw new HttpError(502, 'Non ho potuto caricare la foto.');

    // Cache-Control: no-store. Vedi punto 1: questa URL scade.
    return new Response(JSON.stringify({ photoUri: data.photoUri, maxWidthPx }), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
