# Corrections 02-09-2026

- Validation/refus des réservations : vérification fraîche du statut administrateur via `is_admin_user(auth.uid())` avant le chargement et surtout au clic.
- UPDATE réservation vérifié avec `.select('id,status').single()`.
- Compteur admin sans RPC legacy inexistant.
- CSS des boutons « Voir la fiche et les avis » / « Réserver le jeu → » restauré depuis la version précédente.
- Cache-busting : `app.js?v=10`, `styles.css?v=8`.

- Correction gestion des exemplaires : les demandes `pending` et réservations `approved` consomment une capacité du jeu, et le contrôle Supabase autorise plusieurs réservations simultanées jusqu'à `games.copies_count`.
