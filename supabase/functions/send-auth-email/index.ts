/**
 * send-auth-email - implementa il Send Email Hook di Supabase Auth.
 *
 * PERCHE' ESISTE.
 * Il servizio email integrato di Supabase e' esplicitamente non adatto alla
 * produzione: invia al massimo 2 messaggi all'ORA e solo verso indirizzi di
 * membri del team del progetto. Con "enable_confirmations = true", il terzo
 * utente che si registra nella stessa ora non riceve nulla e resta bloccato
 * su una schermata che dice "controlla la posta". Non e' un problema di
 * scala: e' un problema che si presenta al primo test con tre amici.
 * Con questo hook attivo, Supabase Auth NON invia piu' nulla da solo: delega
 * qui, e qui si usa Resend.
 *
 * SICUREZZA. L'hook e' un endpoint pubblico (va deployato con
 * --no-verify-jwt, perche' Auth lo chiama senza JWT utente). L'unica cosa che
 * distingue Supabase da un estraneo e' la firma Standard Webhooks, verificata
 * sotto con SEND_EMAIL_HOOK_SECRET. Senza quella verifica, chiunque potrebbe
 * far partire email di recupero password a nome del progetto.
 *
 * Il link di conferma si costruisce a mano da token_hash e redirect_to:
 *   {SUPABASE_URL}/auth/v1/verify?token={token_hash}&type={action}&redirect_to={redirect}
 * E' l'endpoint che Auth userebbe comunque; qui cambia solo chi spedisce la
 * busta.
 */

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { preflight, json, fail } from '../_shared/cors.ts';
import { toErrorResponse, HttpError } from '../_shared/auth.ts';

type EmailActionType =
  | 'signup'
  | 'recovery'
  | 'email_change'
  | 'email_change_current'
  | 'email_change_new'
  | 'magiclink'
  | 'magic_link'
  | 'invite';

type HookPayload = {
  user?: { email?: string; new_email?: string | null };
  email_data?: {
    token?: string;
    token_hash?: string;
    token_hash_new?: string;
    redirect_to?: string;
    email_action_type?: string;
    site_url?: string;
  };
};

type Branding = { subject: string; heading: string; body: string; cta: string };

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Variabile d'ambiente ${name} non configurata.`);
  return value;
}

/**
 * Testi per tipo di azione. Un solo template generico ("clicca qui per
 * continuare") e' il modo piu' rapido per far sembrare l'email un phishing:
 * l'utente deve riconoscere il motivo per cui l'ha ricevuta.
 */
function brandingFor(action: EmailActionType): Branding {
  switch (action) {
    case 'recovery':
      return {
        subject: 'Reimposta la password di Quattro',
        heading: 'Hai chiesto una nuova password',
        body:
          'Tocca il pulsante per scegliere una nuova password. Se non hai chiesto ' +
          'niente, ignora questa email: la password attuale resta valida.',
        cta: 'Scegli una nuova password',
      };
    case 'email_change':
    case 'email_change_current':
    case 'email_change_new':
      return {
        subject: 'Conferma il nuovo indirizzo email',
        heading: 'Confermi il cambio di indirizzo?',
        body:
          'Per completare il cambio di indirizzo serve una conferma da questa ' +
          'casella. Il vecchio indirizzo resta attivo fino ad allora.',
        cta: 'Confermo il nuovo indirizzo',
      };
    case 'magiclink':
    case 'magic_link':
      return {
        subject: 'Il tuo accesso a Quattro',
        heading: 'Entra in Quattro',
        body:
          'Questo link ti fa entrare senza password. Vale una sola volta e ' +
          'scade a breve.',
        cta: 'Entra ora',
      };
    case 'invite':
      return {
        subject: 'Sei stato invitato su Quattro',
        heading: 'Ti hanno invitato su Quattro',
        body: 'Attiva il tuo accesso per iniziare a segnare i posti dove mangi.',
        cta: 'Attiva il mio accesso',
      };
    case 'signup':
    default:
      return {
        subject: 'Conferma la tua email per Quattro',
        heading: 'Ci siamo quasi',
        body:
          'Confermando l&rsquo;indirizzo attivi il tuo account. Poi scegli uno ' +
          'username e sei dentro.',
        cta: 'Conferma la mia email',
      };
  }
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function buildHtml(branding: Branding, confirmUrl: string, code: string | null): string {
  const url = escapeAttr(confirmUrl);
  const codeBlock = code
    ? `<tr>
              <td align="center" style="padding:0 32px 8px 32px;">
                <p style="margin:0;font-size:14px;color:#8A6E60;">Oppure inserisci questo codice nell'app:</p>
                <p style="margin:8px 0 0 0;font-size:28px;letter-spacing:6px;font-weight:700;color:#2B1B14;">${escapeAttr(code)}</p>
              </td>
            </tr>`
    : '';

  // CSS inline: i client email scartano <style> e le classi.
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
                <h1 style="margin:12px 0 0 0;font-size:26px;line-height:1.25;color:#2B1B14;font-weight:700;">${branding.heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0 32px;">
                <p style="margin:0;font-size:16px;line-height:1.6;color:#5A453B;">${branding.body}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 16px 32px;">
                <a href="${url}" style="display:inline-block;background:#B4643C;color:#FFFBF5;text-decoration:none;font-size:17px;font-weight:600;padding:15px 34px;border-radius:14px;">${branding.cta}</a>
              </td>
            </tr>
            ${codeBlock}
            <tr>
              <td style="padding:24px 32px 32px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#A08A7C;border-top:1px solid #EADFD3;padding-top:16px;">
                  Se non hai richiesto questa email puoi ignorarla. Il link vale una
                  sola volta e scade.
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

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metodo non consentito.');

    const rawBody = await req.text();

    // Verifica della firma Standard Webhooks. Il segreto arriva dal pannello
    // nella forma "v1,whsec_XXXX": la libreria vuole solo la parte base64.
    const secret = requiredEnv('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', '');
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let payload: HookPayload;
    try {
      payload = new Webhook(secret).verify(rawBody, headers) as HookPayload;
    } catch (_e) {
      throw new HttpError(401, 'Firma del webhook non valida.');
    }

    const emailData = payload.email_data;
    const recipient = payload.user?.new_email || payload.user?.email;
    if (!emailData?.token_hash || !recipient) {
      throw new HttpError(400, 'Payload dell hook incompleto.');
    }

    const action = (emailData.email_action_type ?? 'signup') as EmailActionType;
    const branding = brandingFor(action);

    const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
    // redirect_to torna dentro l'app: lo schema quattro:// e' registrato in
    // additional_redirect_urls (vedi supabase/config.toml).
    const redirectTo = emailData.redirect_to || 'quattro://auth/callback';
    // Per email_change_new Auth manda token_hash_new: usarlo, altrimenti il
    // link conferma il vecchio indirizzo.
    const tokenHash =
      action === 'email_change_new' && emailData.token_hash_new
        ? emailData.token_hash_new
        : emailData.token_hash;
    const verifyType = action === 'magic_link' ? 'magiclink' : action;

    const confirmUrl =
      `${supabaseUrl}/auth/v1/verify` +
      `?token=${encodeURIComponent(tokenHash)}` +
      `&type=${encodeURIComponent(verifyType)}` +
      `&redirect_to=${encodeURIComponent(redirectTo)}`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requiredEnv('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'Quattro <accessi@quattro.app>',
        to: [recipient],
        subject: branding.subject,
        html: buildHtml(branding, confirmUrl, emailData.token ?? null),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('resend', response.status, detail);
      // 500 e non 502: Supabase Auth ritenta l'hook sui 5xx.
      throw new HttpError(500, "Invio dell'email non riuscito.");
    }

    return json({});
  } catch (err) {
    return toErrorResponse(err, fail);
  }
});
