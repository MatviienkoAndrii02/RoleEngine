# Role Engine

Role Engine is a modular character management app for Game Masters and players. It is not a dice roller, virtual tabletop, or game client. Characters are dynamic node trees; every stat, resource, item, wound, body part, note, table, or invented concept is represented by a node.

## Architecture

- `src/app` contains Next.js App Router pages, API routes, and route groups.
- `src/server` contains server actions and data access boundaries.
- `src/domain` contains stable TypeScript domain types shared by UI and engine.
- `src/engine` contains the dependency engine. It is intentionally framework-free.
- `src/store` contains Zustand UI state.
- `src/components` contains shadcn-style primitives and app-specific UI.
- `prisma/schema.prisma` defines the dynamic PostgreSQL model.

## Core Decisions

Characters do not have fixed fields such as `strength`, `mana`, or `inventory`. A `CharacterNode` stores type, hierarchy, order, and JSON payload. Node payloads are validated at the application boundary according to `NodeType`.

Templates are copied into characters as independent node trees. Existing character nodes never point to mutable template structure for live behavior. Effects are copied too, with remapped node references.

Effects are declarative JSON and never executable user code. The engine supports conditions, target selectors, operations, source expressions, cycle detection, incremental recalculation hooks, and calculation explanations.

Authorization is role-based:

- `GM` can create and edit characters, templates, nodes, effects, and assignments.
- `PLAYER` can only read assigned characters.

Every mutation writes an `AuditLog` entry with actor, entity, old value, new value, and metadata.

## Transactional email

Password reset email is delivered through Resend using localized plain-text and HTML alternatives. The provider must serialize every current and future message as RFC 5322/MIME; application code must not assemble raw headers. `From`, `To`, `Reply-To`, and `Subject` values must reject CR/LF, HTML values must be escaped, and reset links or tokens must never be logged or written to audit records. New email templates belong in the shared server email boundary, require both `uk` and `en` copy, and need tests for both alternatives and header-injection protection.

Email delivery requires `APP_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`. The `EMAIL_FROM` domain must be verified by the provider, and container/service deployments must explicitly pass all three variables to the application runtime.

New registrations receive a one-time email-verification link. An unverified account can sign in and use access granted in existing workspaces, but server authorization blocks creation of a new workspace until `User.emailVerified` contains a timestamp. Migration `20260927133000_verify_existing_user_emails` marks every account that predates this policy as verified; production deployments must apply it with `npx prisma migrate deploy` before starting the updated application.

## Admin Console

`/admin` (UI) and `/admin-api` (backend namespace) host the operations console: dashboard with real system/database health, health details, and database backups. Details, configuration and the exposure modes live in [docs/ADMIN_CONSOLE.md](docs/ADMIN_CONSOLE.md).

Access reuses existing accounts through the `ADMIN_ACCOUNTS` allowlist (emails or account ids); there is no second user system and no workspace role grants ops access. Every admin route and every admin API request is authorized on the server — the UI is not a security boundary.

Backups are created with `pg_dump`, stored in a controlled directory (`ADMIN_BACKUP_DIR`, default `./backups`), listed with metadata, downloadable as a streamed attachment, deletable with confirmation, and restorable through a POST action that requires typing a confirmation token and takes a safety backup first.

The console runs in two supported modes: reachable from the LAN only (proxy `ipAllowList`, with `ADMIN_ALLOWED_IP_RANGES` as optional defence-in-depth) or reachable from the internet through the existing Cloudflare Tunnel. Public mode requires the hardening checklist from `docs/ADMIN_CONSOLE.md`: HTTPS only, separate ops accounts, proxy rate limiting, no IP allowlist configured, and awareness that an administrator can download a full database dump or overwrite the database with a restore.

## First Run

create .env
```bash
DATABASE_URL="YourDatabaseURL"
AUTH_SECRET="YourSecret"
AUTH_TRUST_HOST=true
```
then
```bash
npm install
npm run prisma:migrate
npm run dev
```

The current implementation includes mock-friendly dashboard and character pages, Prisma schema, Auth.js configuration, server actions, API route shells, and a first dependency engine.
