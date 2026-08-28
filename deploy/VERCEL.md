# Deploy FREE to Vercel + Turso (no card required)

Zero-cost, always-online hosting. Turso is hosted SQLite (LibSQL), so your
Prisma schema works as-is — no card on either service.

> What works on Vercel: everything except file-based features
> (logo/document uploads, database backups) — serverless has no persistent disk.
> Those features return a clear "not available" message. For full features use
> the VPS route (`deploy/README.md`).

## 1. Create the Turso database (free, no card)

```bash
# install the CLI (or use turso.dev web install)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup          # free account
turso db create cbm        # creates your database
turso db show cbm --url    # -> TURSO_DATABASE_URL (libsql://....turso.io)
turso db tokens create cbm # -> TURSO_AUTH_TOKEN

# create the tables in Turso (uses the project's schema)
turso db shell cbm < <(bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script)
```

## 2. Create a session secret

Sessions are signed with `APP_SECRET`. Generate one:

```bash
openssl rand -hex 32
```

## 3. Deploy to Vercel (free, no card)

1. Go to https://vercel.com → **Continue with GitHub** → import the `cloths` repo
2. Framework preset: **Next.js** (auto-detected) — leave build settings default
3. **Before clicking Deploy**, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://cbm-<...>.turso.io` (from step 1) |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `APP_SECRET` | the hex string from step 2 |

4. Click **Deploy** — done in ~2 minutes.

## 4. Create your first login

Vercel has no shell, so create the OWNER user directly in Turso from your
machine — the script now talks to Turso when you set its env vars:

```bash
TURSO_DATABASE_URL="libsql://cbm-<...>.turso.io" \
TURSO_AUTH_TOKEN="<your-token>" \
bun scripts/create-admin-user.ts admin "Your Name" "StrongPass123!"
```

Then log in at your Vercel URL with those credentials.

## 5. Redeploys

Every `git push` to GitHub auto-deploys to Vercel. Schema changes:

```bash
turso db shell cbm < <(bunx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script)  # see step 1 pattern
```

## Environment variable reference

| Variable | Where | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | Vercel | Remote DB (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Vercel | Turso auth token |
| `APP_SECRET` | Vercel | Session signing secret (hex) |
| `DATABASE_URL` | local only | `file:...` path for dev (`db/custom.db`) |
