-- ============================================================
-- 0015 - Cancellazione account (GDPR): soft delete con grace period
--
-- COSA: colonna deletion_requested_at su profiles, due RPC (richiesta e
--       annullamento), e due funzioni di sola lettura usate da una Edge
--       Function (supabase/functions/purge-deleted-accounts) invocata ogni
--       notte via pg_cron + pg_net, che cancella in modo definitivo chi ha
--       superato i 30 giorni.
-- PERCHE' un blocco preventivo sulla proprieta' di gruppi condivisi:
--       groups.owner_id referenzia profiles(id) ON DELETE CASCADE. Cancellare
--       il profilo di chi possiede un gruppo NON personale con altri membri
--       distruggerebbe quel gruppo -- e tutte le recensioni di TUTTI i membri
--       al suo interno -- non solo i dati di chi ha chiesto la cancellazione.
--       request_account_deletion() rifiuta l'operazione in questo caso.
--       accounts_ready_for_purge() (sotto) ricontrolla la stessa condizione al
--       momento della cancellazione effettiva e salta chi nel frattempo e'
--       diventato proprietario di un gruppo condiviso: la richiesta puo'
--       essere stata fatta quando la condizione non c'era ancora.
-- PERCHE' cancellazione a cascata delle recensioni, non anonimizzazione:
--       decisione di prodotto confermata il 29/8 (minimizzazione dei dati,
--       piu' prudente lato GDPR). Le FK esistenti (reviews.author_id ...
--       on delete cascade, vedi 0002) la implementano gia' senza bisogno di
--       toccare lo schema di reviews.
--
-- PERCHE' LA CANCELLAZIONE VERA NON E' QUI DENTRO (cambiato rispetto alla
-- prima versione di questa migrazione, mai applicata in produzione).
-- Verificato provando: le installazioni recenti di Supabase Storage hanno un
-- trigger BEFORE DELETE su storage.objects (storage.protect_delete) che
-- rifiuta QUALUNQUE "delete from storage.objects" fatto da SQL puro, cascade
-- compreso, con errore 42501 "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead." Non e' aggirabile da una funzione
-- SECURITY DEFINER: il trigger non guarda i privilegi di chi esegue, guarda
-- che l'operazione sia un DELETE su quella tabella. L'unico modo pulito di
-- rimuovere un file (riga di metadati E blob nel backend S3-compatibile,
-- non solo la riga) e' passare dalla vera Storage API, che da SQL non e'
-- raggiungibile: da qui la Edge Function. Cancellare prima auth.users e
-- sperare che il cascade ripulisca storage.objects avrebbe SOLO spostato il
-- problema: lo stesso trigger avrebbe rifiutato anche quel cascade.
-- ============================================================

alter table public.profiles
  add column deletion_requested_at timestamptz;

-- ------------------------------------------------------------
-- request_account_deletion: avvia il grace period di 30 giorni.
-- ------------------------------------------------------------
create or replace function public.request_account_deletion()
returns public.profiles language plpgsql security definer set search_path = ''
as $$
declare
  v_blocking_group text;
  v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select g.name into v_blocking_group
    from public.groups g
   where g.owner_id = auth.uid()
     and g.is_personal = false
     and (select count(*) from public.group_members gm where gm.group_id = g.id) > 1
   limit 1;

  if v_blocking_group is not null then
    raise exception 'Sei proprietario del gruppo "%" con altri membri: trasferisci la proprieta o rimuovili prima di eliminare l''account.',
      v_blocking_group;
  end if;

  update public.profiles set deletion_requested_at = now(), updated_at = now()
   where id = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

-- ------------------------------------------------------------
-- cancel_account_deletion: ripensamento entro i 30 giorni.
-- ------------------------------------------------------------
create or replace function public.cancel_account_deletion()
returns public.profiles language plpgsql security definer set search_path = ''
as $$
declare v_row public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.profiles set deletion_requested_at = null, updated_at = now()
   where id = auth.uid()
  returning * into v_row;
  return v_row;
end $$;

grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion()  to authenticated;
revoke execute on function public.request_account_deletion() from anon;
revoke execute on function public.cancel_account_deletion()  from anon;

-- ------------------------------------------------------------
-- accounts_ready_for_purge: SOLA LETTURA. Chi ha superato i 30 giorni e non
-- e' (ri)diventato proprietario di un gruppo condiviso nel frattempo. Ne'
-- SELECT ne' cancellazioni dirette qui: la Edge Function la chiama, poi
-- cancella lei stessa Storage (via l'API vera) e infine l'utente (via
-- auth.admin.deleteUser). Solo service_role: espone chi sta per essere
-- cancellato, non deve essere richiamabile da un utente qualunque.
-- ------------------------------------------------------------
create or replace function public.accounts_ready_for_purge()
returns setof uuid language sql security definer stable set search_path = ''
as $$
  select p.id
    from public.profiles p
   where p.deletion_requested_at is not null
     and p.deletion_requested_at < now() - interval '30 days'
     and not exists (
       select 1 from public.groups g
        where g.owner_id = p.id
          and g.is_personal = false
          and (select count(*) from public.group_members gm where gm.group_id = g.id) > 1
     );
$$;

-- ------------------------------------------------------------
-- storage_objects_pending_purge: SOLA LETTURA, mai una DELETE -- per questo
-- non tocca in alcun modo storage.protect_delete. Restituisce bucket e nome
-- di ogni file dell'utente, cosi' la Edge Function puo' chiamare
-- storage.from(bucket).remove([...]) -- la Storage API vera -- invece di
-- una SQL diretta che verrebbe comunque rifiutata.
-- ------------------------------------------------------------
create or replace function public.storage_objects_pending_purge(p_user_id uuid)
returns table (bucket_id text, name text)
language sql security definer stable set search_path = ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.owner = p_user_id
     and o.bucket_id in ('avatars', 'review-photos');
$$;

revoke execute on function public.accounts_ready_for_purge() from public, anon, authenticated;
revoke execute on function public.storage_objects_pending_purge(uuid) from public, anon, authenticated;
grant execute on function public.accounts_ready_for_purge() to service_role;
grant execute on function public.storage_objects_pending_purge(uuid) to service_role;

-- ------------------------------------------------------------
-- Job pg_cron giornaliero: chiama la Edge Function invece di una funzione
-- SQL (vedi PERCHE' sopra). Stesso pattern di guardia di 0007 per pg_cron;
-- pg_net e' l'estensione che permette a Postgres di fare una richiesta HTTP
-- in uscita, entrambe potrebbero non esistere su un ambiente che non le ha
-- abilitate esplicitamente.
--
-- Il segreto nell'header (x-webhook-secret, stesso meccanismo gia' in uso
-- per notify-invite) NON viene scritto qui: finirebbe in chiaro in un file
-- versionato su git. Va inserito una tantum in Vault, a mano, DOPO aver
-- fatto "supabase secrets set PURGE_CRON_SECRET=..." per la Edge Function:
--   select vault.create_secret('<lo-stesso-valore>', 'purge_cron_secret');
-- Senza quel passaggio il job non viene creato (o resta senza segreto valido
-- se gia' creato): vedi DEPLOY_CHECKLIST.md per i comandi completi.
-- ------------------------------------------------------------
do $mig$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron non disponibile: job di cancellazione account non creato. '
                 'Abilita l''estensione e riesegui questa migrazione.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net non disponibile: job di cancellazione account non creato. '
                 'Abilita l''estensione e riesegui questa migrazione.';
    return;
  end if;
  if not exists (select 1 from pg_catalog.pg_namespace where nspname = 'vault') then
    raise notice 'Vault non disponibile: job di cancellazione account non creato.';
    return;
  end if;

  execute $sql$
    select cron.schedule(
      'quattro_purge_deleted_accounts',
      '0 4 * * *',
      $cmd$
        select net.http_post(
          -- Sostituisci con l'URL del TUO progetto se diverso (vedi
          -- EXPO_PUBLIC_SUPABASE_URL in .env): il ref e' pubblico, non e' un
          -- segreto, e' solo l'identificativo del progetto.
          url := 'https://uiuqdoaarjbwlcxrdyth.supabase.co/functions/v1/purge-deleted-accounts',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', (
              select decrypted_secret from vault.decrypted_secrets
               where name = 'purge_cron_secret'
            )
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
  $sql$;
end $mig$;
