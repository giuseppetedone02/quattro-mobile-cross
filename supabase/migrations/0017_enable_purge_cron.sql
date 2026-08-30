-- ============================================================
-- 0017 - Abilita pg_cron/pg_net e ri-schedula il job di purga account (0015)
--
-- COSA: la 0015 aveva gia' pronto il job pg_cron per invocare ogni notte
--       purge-deleted-accounts, ma dietro una guardia che lo salta (con un
--       NOTICE, non un errore) se pg_cron/pg_net/vault mancano -- ed era
--       proprio il caso: verificato sul progetto remoto, ne' pg_cron ne'
--       pg_net risultavano abilitati, quindi il job non era mai stato
--       creato.
-- PERCHE' il CREATE EXTENSION e' avvolto in un blocco che non fa fallire la
--       migrazione se il permesso viene negato: su Supabase pg_cron/pg_net
--       a volte vanno abilitate dalla Dashboard (Database > Extensions),
--       non da SQL diretto con il ruolo usato dalle migrazioni. Se il
--       tentativo qui sotto fallisce per permessi, la migrazione si ferma
--       con un NOTICE invece di un errore fatale -- il passo a mano e'
--       descritto in DEPLOY_CHECKLIST.md.
-- PERCHE' lo schedule e' ripetuto qui invece di limitarsi a modificare la
--       0015: quella migrazione risulta gia' applicata (tracciata in
--       supabase_migrations.schema_migrations), quindi modificarla non la
--       farebbe rieseguire. cron.schedule() su un nome di job esistente lo
--       sostituisce, quindi ripetere il blocco qui e' idempotente.
-- ============================================================

do $mig$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when insufficient_privilege then
    raise notice 'Permesso negato per abilitare pg_cron da SQL: abilitala dalla Dashboard '
                 '(Database > Extensions), poi riesegui questa migrazione.';
  end;

  begin
    create extension if not exists pg_net;
  exception when insufficient_privilege then
    raise notice 'Permesso negato per abilitare pg_net da SQL: abilitala dalla Dashboard '
                 '(Database > Extensions), poi riesegui questa migrazione.';
  end;
end $mig$;

do $mig$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron non disponibile: job di cancellazione account non creato. '
                 'Abilitala dalla Dashboard e riesegui questa migrazione.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net non disponibile: job di cancellazione account non creato. '
                 'Abilitala dalla Dashboard e riesegui questa migrazione.';
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
          -- Sostituisci con l'URL del TUO progetto se diverso: il ref e'
          -- pubblico, non e' un segreto, e' solo l'identificativo del
          -- progetto (vedi EXPO_PUBLIC_SUPABASE_URL in .env).
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
