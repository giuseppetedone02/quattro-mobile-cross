-- ============================================================
-- 0018 - Ri-schedula i job pg_cron originali di 0007
--
-- COSA: gli stessi tre job di 0007 (purga cache Google, scadenza inviti,
--       azzeramento coordinate Google dopo 29 giorni), ripetuti qui.
-- PERCHE': verificato dopo aver abilitato pg_cron/pg_net (vedi 0017) che
--       QUESTI TRE JOB NON ESISTEVANO SUL PROGETTO REMOTO -- pg_cron non era
--       ancora disponibile quando la 0007 fu applicata la prima volta, quindi
--       la sua guardia difensiva li aveva saltati tutti e tre, in silenzio
--       (solo un NOTICE), da allora. In pratica, da quando il progetto esiste:
--        - la cache di google_place_cache non e' mai stata ripulita (righe
--          scadute accumulate, non un rischio ma spreco di spazio);
--        - gli inviti scaduti non sono mai passati a "expired" da soli
--          (un admin non poteva reinvitare la stessa persona finche' non li
--          apriva lei stessa, facendo scattare il controllo lato client);
--        - PIU' SERIO: le coordinate Google non sono mai state azzerate dopo
--          29 giorni. E' l'applicazione MECCANICA dei Google Maps Platform
--          Service Terms sezione 14.3 (lat/lng cacheabili max 30 giorni
--          consecutivi) -- senza questo job il progetto le ha trattenute piu'
--          a lungo di quanto i Termini permettano, per ogni posto collegato a
--          Google dalla creazione del progetto.
-- Ri-schedulare e' sicuro ed idempotente: cron.schedule() su un nome di job
-- gia' esistente lo sostituisce, e qui i nomi sono gli stessi di 0007.
-- ============================================================

do $mig$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron non disponibile: job di manutenzione non ri-creati.';
    return;
  end if;

  execute $sql$
    select cron.schedule(
      'quattro_purge_google_place_cache',
      '*/30 * * * *',
      $cmd$ delete from public.google_place_cache where expires_at < now(); $cmd$
    );
  $sql$;

  execute $sql$
    select cron.schedule(
      'quattro_expire_invitations',
      '0 3 * * *',
      $cmd$ update public.group_invitations
               set status = 'expired'::public.invitation_status
             where status = 'pending' and expires_at < now(); $cmd$
    );
  $sql$;

  -- Il piu' importante dei tre: vedi PERCHE' sopra.
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

-- ------------------------------------------------------------
-- Rimedio one-shot per l'arretrato: qualunque posto Google la cui
-- coords_refreshed_at e' GIA' oltre i 29 giorni (perche' il job non girava)
-- va azzerato SUBITO, non aspettare le 3:30 di stanotte. E' la stessa identica
-- condizione del job qui sopra, eseguita una volta, ora, invece che aspettare
-- la prossima esecuzione schedulata.
-- ------------------------------------------------------------
update public.places
   set lat = null, lng = null, coords_refreshed_at = null
 where source = 'google'
   and coords_refreshed_at is not null
   and coords_refreshed_at < now() - interval '29 days';
