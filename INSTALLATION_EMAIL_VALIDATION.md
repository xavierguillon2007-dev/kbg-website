# Validation des comptes par e-mail

1. Exécuter `MIGRATION_ACCOUNT_EMAIL_VALIDATION.sql` dans Supabase SQL Editor.
2. Déployer `supabase/functions/send-account-status-email/index.ts` dans l'Edge Function `send-account-status-email`.
3. Vérifier que les secrets `RESEND_API_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_SECRET_KEY`) sont disponibles dans l'Edge Function.
4. Conserver `accounts.js`, `admin.js`, `app.js`, `events.js` et `accounts.html` de cette version.

## Nouveau cycle

- `pending` : compte en attente de validation admin.
- `pending_email` : compte validé par l'admin, mais e-mail non confirmé.
- `approved` : compte validé et e-mail confirmé.
- `rejected` : compte refusé.

Lorsqu'un admin valide un compte, l'Edge Function envoie un e-mail avec un lien sécurisé. Le lien confirme l'adresse e-mail via Supabase. Le trigger SQL fait alors passer automatiquement `pending_email` à `approved`.
