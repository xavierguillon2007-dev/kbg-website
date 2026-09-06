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
