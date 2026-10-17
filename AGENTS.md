# docmost-teams

Self-hosted fork of Docmost (AGPL) for teams: OIDC SSO with group/role sync, private spaces, owner access to all ordinary spaces. Each release mirrors an upstream Docmost release.

## Goals

1. Ship no Docmost Enterprise code. Everything is AGPL core plus code written here.
2. Keep upstream syncs cheap: fork code is isolated, upstream files get only thin seams.
3. Make self-hosting easy and safe: simple SSO setup, safe defaults, migration to and from upstream.

## Layout

apps/server/src/teams and apps/client/src/teams: all fork code.
apps/client/src/teams/ee-compat: upstream's @/ee/... imports resolve here (alias in tsconfig.json, vite.config.ts, vitest.config.ts). Real features are re-exported from teams/, missing ones are inert stubs.
apps/server/src/teams/features.ts: TEAMS_FEATURES decides what self-hosted installs get.
docs/upstream-sync.md: sync procedure and every intentional edit to upstream files.

## Constraints

Never add or read Enterprise code: apps/client/src/ee, apps/server/src/ee, packages/ee and packages/base-formula stay deleted. Don't use old git history, remote backup/* or codex/* branches, built bundles or online copies as reference. Build features upstream sells clean-room from the AGPL core and a written design (see docs/teams-client-design.md).
Prefer a teams module or compat module over editing an upstream file. If you must edit one, keep it to an import plus a call, and list it in docs/upstream-sync.md.
A new fork migration needs its reversal in script/migrate-to-upstream.sql.
Client copies of server constants (feature keys, SSO presets, error codes) are checked against the server by client tests; change both.
main is never force-pushed. Ask before pushing or tagging; a v* tag publishes images.
No AI attribution in code or commits.

## Getting started

```bash
corepack pnpm install
bash script/bootstrap-local-dev.sh   # Postgres, Redis, Keycloak, backend on :3000
cd apps/client && corepack pnpm dev  # Vite on :5173
```

Before finishing, run what CI runs:

```bash
bash script/check-no-enterprise-code.sh
corepack pnpm exec nx run-many -t build --projects=server,client
corepack pnpm --filter ./apps/server exec jest --runInBand
corepack pnpm --filter ./apps/client run test
```

More detail: DEVELOPER.md.
