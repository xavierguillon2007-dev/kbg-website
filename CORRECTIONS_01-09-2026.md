# Corrections v12 — 1er septembre 2026

- Retour à la base saine du ZIP `kbg-website-main (1).zip`.
- Suppression de tous les appels au RPC inexistant `get_pending_accounts_admin`.
- Compteur admin calculé directement depuis `account_requests` et `reservations`.
- Gestionnaire de clic de validation/refus des réservations installé en délégation d'événement (capture), indépendant des re-rendus.
- Vérification de session et de `is_admin_user()` au moment du clic.
- Message d'erreur visible + console + alerte si Supabase refuse l'UPDATE.
- Styles des boutons catalogue restaurés selon la version discrète précédente.
- Cache-busting : app.js v12 / styles.css v9.
