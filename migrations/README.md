# Cloudflare D1 migrations

Apply migrations before deploying Functions that reference the new schema:

```powershell
npx wrangler d1 migrations apply <database-name> --remote
```

Use the immutable D1 database name, not a guessed binding or database ID. The Pages binding exposed to the Functions must remain `VISITS_DB`.

Back up the remote database before applying a migration. Do not add a real database ID, account ID, token, or exported production data to this repository.
