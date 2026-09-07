-- KBG — Catégories multiples pour les jeux
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
--
-- La colonne category est conservée pour compatibilité avec l'ancien code.
-- categories devient la source principale et contient toutes les catégories
-- d'un jeu sous forme de tableau text[].

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[];

-- Migration des jeux existants :
-- chaque ancienne catégorie devient la première (et, à ce stade, seule)
-- catégorie du tableau.
UPDATE public.games
SET categories = ARRAY[category]::text[]
WHERE category IS NOT NULL
  AND btrim(category) <> ''
  AND (categories IS NULL OR cardinality(categories) = 0);

-- Pour les lignes sans catégorie, on garantit un tableau vide.
UPDATE public.games
SET categories = '{}'::text[]
WHERE categories IS NULL;

-- Vérification facultative :
-- SELECT id, name, category, categories
-- FROM public.games
-- ORDER BY name;


-- Catalogue persistant des catégories.
-- Une catégorie peut exister même si aucun jeu ne l'utilise encore.
CREATE TABLE IF NOT EXISTS public.game_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Une même catégorie ne peut pas être créée deux fois, quelle que soit la casse.
CREATE UNIQUE INDEX IF NOT EXISTS game_categories_name_lower_key
  ON public.game_categories (lower(btrim(name)));

ALTER TABLE public.game_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_categories_public_select ON public.game_categories;
CREATE POLICY game_categories_public_select
  ON public.game_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS game_categories_admin_insert ON public.game_categories;
CREATE POLICY game_categories_admin_insert
  ON public.game_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

-- Les catégories déjà présentes dans les jeux deviennent persistantes.
INSERT INTO public.game_categories (name)
SELECT DISTINCT btrim(category_name)
FROM public.games g
CROSS JOIN LATERAL unnest(
  CASE
    WHEN g.categories IS NOT NULL AND cardinality(g.categories) > 0
      THEN g.categories
    WHEN g.category IS NOT NULL AND btrim(g.category) <> ''
      THEN ARRAY[g.category]::text[]
    ELSE '{}'::text[]
  END
) AS category_values(category_name)
WHERE btrim(category_name) <> ''
ON CONFLICT ((lower(btrim(name)))) DO NOTHING;


-- Création sécurisée d'une catégorie depuis l'administration.
-- On passe par cette fonction plutôt que par un INSERT direct afin de
-- ne pas dépendre du contexte RLS du navigateur.
CREATE OR REPLACE FUNCTION public.create_game_category_admin(p_name text)
RETURNS TABLE(name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_existing text;
BEGIN
  IF NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs.';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Le nom de la catégorie est vide.';
  END IF;

  SELECT gc.name INTO v_existing
  FROM public.game_categories gc
  WHERE lower(btrim(gc.name)) = lower(v_name)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing;
    RETURN;
  END IF;

  INSERT INTO public.game_categories(name)
  VALUES (v_name)
  RETURNING game_categories.name INTO v_existing;

  RETURN QUERY SELECT v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_game_category_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_game_category_admin(text) TO authenticated;
