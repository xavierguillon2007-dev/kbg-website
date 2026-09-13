-- KBG — Suppression d'une catégorie de jeu
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- Ajoute la fonction permettant à un administrateur de supprimer une
-- catégorie du catalogue (table public.game_categories). La catégorie
-- est également retirée de tous les jeux qui l'utilisaient, pour que
-- l'affichage reste cohérent.

CREATE OR REPLACE FUNCTION public.delete_game_category_admin(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_deleted_count integer;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Le nom de la catégorie est vide.';
  END IF;

  -- Retire la catégorie de tous les jeux qui l'utilisent (tableau categories
  -- + ancienne colonne category conservée pour compatibilité).
  UPDATE public.games
  SET categories = array_remove(categories, v_name)
  WHERE v_name = ANY(categories);

  UPDATE public.games
  SET category = NULL
  WHERE lower(btrim(category)) = lower(v_name);

  -- Supprime la catégorie du catalogue (comparaison insensible à la casse).
  DELETE FROM public.game_categories
  WHERE lower(btrim(name)) = lower(v_name);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_game_category_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_game_category_admin(text) TO authenticated;
