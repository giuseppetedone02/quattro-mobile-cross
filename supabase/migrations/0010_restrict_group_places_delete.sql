-- ============================================================
-- 0010 - Rimuovere un posto dal gruppo: solo l'amministratore se il gruppo
--        ha altri membri (requisito 14 della lista modifiche).
--
-- La vecchia group_places_delete (0004_rls_policies.sql) permetteva la
-- cancellazione anche a chi aveva aggiunto il posto (added_by), indipenden-
-- temente da quanti altri membri ci fossero nel gruppo: chiunque avesse
-- inserito un posto avrebbe potuto farlo sparire per tutti, anche senza
-- essere amministratore. Ora la delete richiede is_group_admin(): nel gruppo
-- personale (un solo membro, sempre owner) resta comunque sempre permessa,
-- perche' quel singolo membro e' anche l'amministratore.
-- ============================================================

drop policy if exists group_places_delete on public.group_places;

create policy group_places_delete on public.group_places for delete to authenticated
  using (public.is_group_admin(group_id));
