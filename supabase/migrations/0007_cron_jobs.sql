-- ============================================================
-- 0007 - Job pianificati (pg_cron)
--
-- COSA: tre job di manutenzione. Il terzo non e' manutenzione: e'
--       l'applicazione MECCANICA di un obbligo contrattuale.
-- PERCHE' un DO block di guardia: pg_cron non e' disponibile su tutti i
--       piani ne' su un Postgres locale nudo. Senza guardia questa
--       migrazione farebbe fallire "supabase db push" o "supabase start"
--       su un ambiente senza l'estensione, bloccando tutto il resto.
--       cron.schedule(jobname, ...) sostituisce il job con lo stesso nome,
--       quindi rieseguire la migrazione e' idempotente.
--
-- I job girano nel database "postgres" (default di pg_cron su Supabase).
-- Gli orari sono in UTC.
-- ============================================================

do $mig$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron non disponibile: job pianificati non creati. '
                 'Abilita l''estensione e riesegui questa migrazione.';
    return;
  end if;

  -- ----------------------------------------------------------
  -- 1) Purga della cache di Google Places, ogni 30 minuti.
  --
  -- Le righe scadute sono inutili (l'Edge Function le ignora comunque
  -- confrontando expires_at) ma continuano a occupare spazio e a gonfiare
  -- l'indice primario. Mezz'ora e' un compromesso: il TTL della cache e' di
  -- 6 ore, quindi una riga scaduta vive al massimo 30 minuti in piu'.
  -- ----------------------------------------------------------
  execute $sql$
    select cron.schedule(
      'quattro_purge_google_place_cache',
      '*/30 * * * *',
      $cmd$ delete from public.google_place_cache where expires_at < now(); $cmd$
    );
  $sql$;

  -- ----------------------------------------------------------
  -- 2) Scadenza degli inviti, ogni notte alle 03:00 UTC.
  --
  -- respond_to_invitation marca "expired" solo se qualcuno prova ad aprire
  -- un invito scaduto. Un invito mai aperto resterebbe "pending" per sempre,
  -- e resterebbe a occupare l'indice unico parziale invite_one_pending_user:
  -- l'amministratore non potrebbe reinvitare la stessa persona. Questo job
  -- e' cio' che rende reinvitabile chi ha ignorato l'invito.
  -- ----------------------------------------------------------
  execute $sql$
    select cron.schedule(
      'quattro_expire_invitations',
      '0 3 * * *',
      $cmd$ update public.group_invitations
               set status = 'expired'::public.invitation_status
             where status = 'pending' and expires_at < now(); $cmd$
    );
  $sql$;

  -- ----------------------------------------------------------
  -- 3) Azzeramento delle coordinate Google dopo 29 giorni,
  --    ogni notte alle 03:30 UTC.
  --
  -- QUESTO NON E' UN JOB DI PULIZIA. E' l'applicazione automatica dei
  -- Google Maps Platform Service Terms sezione 14.3: latitudine e
  -- longitudine ottenute da Places possono essere memorizzate per un massimo
  -- di 30 GIORNI CONSECUTIVI, dopodiche' vanno cancellate e, se servono
  -- ancora, richieste di nuovo. Il place_id invece si puo' conservare a
  -- tempo indeterminato (ed e' l'unico identificativo che conserviamo), per
  -- questo il job azzera lat/lng e coords_refreshed_at ma NON
  -- google_place_id.
  --
  -- La soglia e' 29 giorni e non 30 per avere un margine: il job gira una
  -- volta al giorno, quindi una riga potrebbe restare fino a ~24 ore oltre
  -- la soglia. Con 29 si resta comunque dentro i 30 giorni.
  --
  -- Conseguenza per l'app, da non considerare un bug: un luogo Google puo'
  -- trovarsi senza coordinate. La schermata di dettaglio deve richiederle
  -- all'Edge Function places-details con ?refreshCoords=1, che le riscrive e
  -- aggiorna coords_refreshed_at. I luoghi con source='manual' non sono
  -- toccati: quelle coordinate le ha inserite l'utente e non sono dati Google.
  -- ----------------------------------------------------------
  execute $sql$
    select cron.schedule(
      'quattro_expire_google_coords',
      '30 3 * * *',
      $cmd$ update public.places
               set lat = null, lng = null, coords_refreshed_at = null
             where source = 'google'
               and coords_refreshed_at is not null
               and coords_refreshed_at < now() - interval '29 days'; $cmd$
    );
  $sql$;
end $mig$;
