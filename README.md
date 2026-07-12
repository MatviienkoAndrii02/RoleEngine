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
cp .env.example .env
npm run prisma:migrate
npm run dev
```

The current implementation includes mock-friendly dashboard and character pages, Prisma schema, Auth.js configuration, server actions, API route shells, and a first dependency engine.
