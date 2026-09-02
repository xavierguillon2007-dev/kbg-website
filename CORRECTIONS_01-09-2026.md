# Corrections intégrées

Cette archive repart du dernier `kbg-website-main (1).zip` fourni.

## Corrections
- Suppression des appels JavaScript au RPC inexistant `get_pending_accounts_admin`.
- Le compteur global du bouton `🔑 Admin` compte directement les lignes `pending` de `account_requests` et `reservations`.
- Le badge du bouton Admin est rafraîchi à la connexion, à l'ouverture du panneau Admin et toutes les 30 secondes.
- Ajout du badge `Demandes de réservation` dans `admin.html`.
- Le badge des réservations de l'admin est recalculé après chargement et après validation/refus.
- Cache-busting : `app.js?v=9`, `admin.js?v=9`, `styles.css?v=7`.
- La policy Supabase `reservations_admin_all` n'est pas modifiée par cette archive : elle doit rester celle validée dans la base.

## Important
Les fichiers SQL historiques peuvent encore contenir la définition du RPC legacy `get_pending_accounts_admin`, mais le site n'en dépend plus côté JavaScript.
