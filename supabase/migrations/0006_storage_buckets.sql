-- ============================================================
-- 0006 - Bucket di Storage e relative policy
--
-- COSA: crea i quattro bucket usati dall'app e le policy su storage.objects.
-- PERCHE': storage.objects e' una normale tabella con RLS. Un bucket senza
--       policy e' inaccessibile; un bucket con policy sbagliate e' un disco
--       condiviso pubblico. Le policy qui sotto derivano tutte dalla prima
--       cartella del path, letta con storage.foldername(name)[1].
--
-- Convenzioni di path (rispettate da lib/photos.ts nell'app):
--   avatars/{user_id}/{uuid}.webp
--   group-images/{group_id}/{uuid}.webp
--   place-photos/{place_id}/{uuid}.webp
--   review-photos/{group_id}/{review_id}/{uuid}.webp
--
-- Nota su review-photos: il primo segmento e' il GRUPPO, non la recensione.
-- E' una scelta di progetto: mette il controllo di accesso a portata di una
-- sola chiamata a public.is_group_member(), senza dover risalire da
-- review_id a group_id dentro una policy di storage.
--
-- avatars e group-images sono pubblici: sono immagini che si mostrano nelle
-- liste, e servirle dalla CDN senza firmare ogni URL evita una richiesta per
-- riga. place-photos e review-photos sono privati e si leggono solo con URL
-- firmati (createSignedUrls in lib/photos.ts).
--
-- Il cast ::uuid del primo segmento e' anche una validazione: un path
-- costruito a mano con un segmento non-uuid fa fallire la policy, quindi
-- nega l'operazione.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',       'avatars',       true,  2097152,
    array['image/webp','image/jpeg','image/png']),
  ('group-images',  'group-images',  true,  4194304,
    array['image/webp','image/jpeg','image/png']),
  ('place-photos',  'place-photos',  false, 6291456,
    array['image/webp','image/jpeg','image/png']),
  ('review-photos', 'review-photos', false, 6291456,
    array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- avatars: si scrive SOLO sotto il proprio user id.
-- Senza questo vincolo un utente potrebbe sovrascrivere l'avatar di un altro.
-- ------------------------------------------------------------
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy avatars_update_own on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ------------------------------------------------------------
-- group-images: l'immagine del gruppo e' un'impostazione del gruppo, quindi
-- la scrittura e' riservata agli amministratori, coerentemente con la policy
-- groups_update. La lettura e' aperta ai membri (e via CDN a chi ha l'URL).
-- ------------------------------------------------------------
create policy group_images_insert_admin on storage.objects for insert to authenticated
  with check (
    bucket_id = 'group-images'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );
create policy group_images_select_member on storage.objects for select to authenticated
  using (
    bucket_id = 'group-images'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );
create policy group_images_delete_admin on storage.objects for delete to authenticated
  using (
    bucket_id = 'group-images'
    and public.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

-- ------------------------------------------------------------
-- place-photos: chiunque possa leggere il luogo puo' vedere e aggiungere
-- foto (i dati del luogo sono collaborativi, come places_update), ma
-- cancellare solo cio' che ha caricato: storage.objects.owner e' impostato
-- dal servizio all'upload.
-- ------------------------------------------------------------
create policy place_photos_insert_reader on storage.objects for insert to authenticated
  with check (
    bucket_id = 'place-photos'
    and public.can_read_place(((storage.foldername(name))[1])::uuid)
  );
create policy place_photos_select_reader on storage.objects for select to authenticated
  using (
    bucket_id = 'place-photos'
    and public.can_read_place(((storage.foldername(name))[1])::uuid)
  );
create policy place_photos_delete_owner on storage.objects for delete to authenticated
  using (
    bucket_id = 'place-photos'
    and owner = (select auth.uid())
  );

-- ------------------------------------------------------------
-- review-photos: primo segmento = group_id, quindi la policy e' una sola
-- chiamata a is_group_member. Cancella solo chi ha caricato.
-- ------------------------------------------------------------
create policy review_photos_insert_member on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review-photos'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );
create policy review_photos_select_member on storage.objects for select to authenticated
  using (
    bucket_id = 'review-photos'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );
create policy review_photos_delete_owner on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and owner = (select auth.uid())
  );
