/**
 * notify-invite - invia l'email di invito a un gruppo.
 *
 * Si attiva da un Database Webhook su INSERT in public.group_invitations
 * (Dashboard > Database > Webhooks, oppure un trigger su supabase_functions).
 * Non e' chiamata dall'app: cosi' l'email parte anche se l'invito viene
 * creato da un'altra RPC, da SQL o da un'automazione futura. La sorgente di
 * verita' e' la riga nella tabella, non il codice che l'ha inserita.
 *
 * PERCHE' DUE LINK NELL'EMAIL, e non solo il deep link.
 * "quattro://invite/{token}" funziona solo se l'app e' installata. Se non lo
 * e' -- ed e' il caso NORMALE per un invito, perche' si invita chi ancora non
 * usa Quattro -- toccare quel link non fa assolutamente nulla: nessun errore,
 * nessuna pagina, nessun messaggio. L'utente conclude che l'invito e' rotto.
 * Il progetto non usa Universal Links / App Links, perche' richiedono
 * l'entitlement associated-domains, che un Apple Personal Team non puo'
 * concedere (e il sideload e' proprio il caso d'uso). Quindi serve una pagina
 * web di fallback che spieghi come installare l'app e riproponga il token.
 * Il link web e' quello prominente; il deep link e' l'alternativa per chi
 * l'app ce l'ha.
 *
 * La funzione va deployata con --no-verify-jwt: il webhook non porta un JWT
 * utente. L'autenticazione e' il segreto condiviso INVITE_WEBHOOK_SECRET.
 */

import { preflight, json, fail } from '../_shared/cors.ts';
import { serviceClient, toErrorResponse, HttpError } from '../_shared/auth.ts';

type InvitationRecord = {
  id?: string;
  group_id?: string;
  inviter_id?: string;
  invitee_id?: string | null;
  invitee_email?: string | null;
  token?: string;
  status?: string;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: InvitationRecord;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Variabile d'ambiente ${name} non configurata.`);
  return value;
}

/**
 * Il webhook non ha un utente, quindi l'unica difesa e' il segreto.
 * Senza, l'endpoint sarebbe un modulo per spedire email a nome del progetto.
 */
function assertWebhookSecret(req: Request): void {
  const expected = requiredEnv('INVITE_WEBHOOK_SECRET');
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (provided !== expected) throw new HttpError(401, 'Chiamata non autorizzata.');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildHtml(args: {
  groupName: string;
  inviterName: string;
  webUrl: string;
  deepLink: string;
}): string {
  const groupName = escapeHtml(args.groupName);
  const inviterName = escapeHtml(args.inviterName);
  const webUrl = escapeHtml(args.webUrl);
  const deepLink = escapeHtml(args.deepLink);

  // CSS inline: i client email ignorano <style> e le classi.
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#1A1210;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1A1210;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFBF5;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#B4643C;font-weight:600;">Quattro</p>
                <h1 style="margin:12px 0 0 0;font-size:26px;line-height:1.25;color:#2B1B14;font-weight:700;">
                  ${inviterName} ti ha invitato in &ldquo;${groupName}&rdquo;
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;">
                <p style="margin:0;font-size:16px;line-height:1.6;color:#5A453B;">
                  In Quattro si segnano i posti dove si mangia e si danno quattro voti:
                  Location, Servizio, Menu e Conto. Ogni gruppo ha le sue medie.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 8px 32px;">
                <a href="${webUrl}" style="display:inline-block;background:#B4643C;color:#FFFBF5;text-decoration:none;font-size:17px;font-weight:600;padding:15px 34px;border-radius:14px;">
                  Accetta l'invito
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 0 32px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#8A6E60;">
                  Hai gia' Quattro installato?
                  <a href="${deepLink}" style="color:#B4643C;font-weight:600;">Apri direttamente nell'app</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#A08A7C;border-top:1px solid #EADFD3;padding-top:16px;">
                  L'invito scade fra 14 giorni. Se non conosci ${inviterName}, ignora
                  questa email: senza il link non entra nessuno nel gruppo.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(args: {
  groupName: string;
  inviterName: string;
  webUrl: string;
  deepLink: string;
}): string {
  return [
    `${args.inviterName} ti ha invitato nel gruppo "${args.groupName}" su Quattro.`,
    '',
    `Accetta l'invito: ${args.webUrl}`,
    `Hai gia' l'app? Aprila qui: ${args.deepLink}`,
    '',
    "L'invito scade fra 14 giorni.",
  ].join('\n');
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');
    assertWebhookSecret(req);

    const payload = (await req.json().catch(() => ({}))) as WebhookPayload;
    const record = payload.record;

    if (payload.type !== 'INSERT' || payload.table !== 'group_invitations' || !record) {
      // Non e' un errore: il webhook puo' essere configurato piu' largo.
      return json({ skipped: 'evento non pertinente' });
    }
    if (record.status && record.status !== 'pending') {
      return json({ skipped: 'invito non pendente' });
    }
    if (!record.token || !record.group_id || !record.inviter_id) {
      throw new HttpError(400, 'Payload del webhook incompleto.');
    }

    const db = serviceClient();

    // Service-role key: il webhook non ha un utente, quindi non c'e' nessuna
    // identita' a cui applicare la RLS. Le tre letture sono mirate a una riga.
    const [group, inviter] = await Promise.all([
      db.from('groups').select('name').eq('id', record.group_id).maybeSingle(),
      db.from('profiles').select('username, display_name').eq('id', record.inviter_id).maybeSingle(),
    ]);

    if (group.error || !group.data) throw new HttpError(404, 'Gruppo non trovato.');
    if (inviter.error) throw new HttpError(500, 'Non ho potuto leggere chi invita.');

    // Il destinatario: se invitee_id e' valorizzato l'indirizzo sta in
    // auth.users, altrimenti e' l'email dell'invito "al buio".
    let recipient = record.invitee_email ?? null;
    if (!recipient && record.invitee_id) {
      const { data, error } = await db.auth.admin.getUserById(record.invitee_id);
      if (error) throw new HttpError(500, 'Non ho potuto leggere il destinatario.');
      recipient = data.user?.email ?? null;
    }
    if (!recipient) throw new HttpError(400, 'Invito senza destinatario raggiungibile.');

    const inviterName =
      inviter.data?.display_name?.trim() ||
      inviter.data?.username ||
      'Un amico';

    const webBase = requiredEnv('INVITE_WEB_BASE_URL').replace(/\/+$/, '');
    const webUrl = `${webBase}/invite/${record.token}`;
    const deepLink = `quattro://invite/${record.token}`;

    const args = {
      groupName: (group.data.name as string) ?? 'un gruppo',
      inviterName,
      webUrl,
      deepLink,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'Quattro <inviti@quattro.app>',
        to: [recipient],
        subject: `${inviterName} ti ha invitato in "${args.groupName}"`,
        html: buildHtml(args),
        text: buildText(args),
      }),
    });

    if (!response.ok) {
      console.error('resend', response.status, await response.text());
      throw new HttpError(502, "Non ho potuto inviare l'email di invito.");
    }

    return json({ sent: true });
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
