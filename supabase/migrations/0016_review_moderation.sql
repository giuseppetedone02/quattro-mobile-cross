-- ============================================================
-- 0016 - Moderazione contenuti: un admin di gruppo puo' rimuovere la
-- recensione (e le foto) di un altro membro
--
-- COSA: allarga reviews_delete a is_group_admin(group_id) oltre al proprio
--       author_id, e aggiunge una policy di sola DELETE su review_photos per
--       lo stesso ruolo.
-- PERCHE' una policy NUOVA su review_photos invece di modificare
--       review_photos_write ("for all", vedi 0004): quella resta l'unica via
--       per inserire/modificare le proprie foto. Allargarla avrebbe dato
--       all'admin anche il permesso di modificarle, non solo rimuoverle. Piu'
--       policy permissive sullo stesso comando si combinano in OR (Postgres
--       RLS), quindi la nuova policy aggiunge una via di DELETE senza toccare
--       le altre operazioni ne' i permessi di chi ha scritto la recensione.
-- Non e' previsto in questa fase un sistema di segnalazione (report) da
-- parte dei membri: solo rimozione diretta da parte di un admin, come da
-- piano.
-- ============================================================

drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_group_admin(group_id));

create policy review_photos_delete_admin on public.review_photos for delete to authenticated
  using (exists (select 1 from public.reviews r
                  where r.id = review_id and public.is_group_admin(r.group_id)));
