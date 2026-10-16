# Developing docmost-teams

This guide covers local development, the build and release flow, and how new
upstream Docmost releases are adopted. For what docmost-teams is and how to
self-host it, see the [README](README.md).

## Prerequisites

- Node.js 24 or newer. Release images build on the Node version in
  [`Dockerfile`](Dockerfile).
- Corepack, which ships with Node.js. The pnpm version is pinned in
  `package.json` under `packageManager`, and `corepack pnpm` runs exactly that
  version.
- Docker with Docker Compose.
- Python 3, used by the local SSO bootstrap scripts.

This repo is a `pnpm` workspace managed with `nx`. Install dependencies once
from the repo root, and don't run `npm install` inside `apps/client`,
`apps/server`, or `packages/*`.

## Where fork code lives

Fork-owned features are kept apart from upstream code so that new upstream
releases rebase cleanly:

- `apps/server/src/teams`: SSO, private spaces, and the features unlocked
  for self-hosted installs. `AppModule` imports `TeamsModule`.
- `apps/client/src/teams`: the matching client code. Upstream files only
  import from here or add small rendering hooks.

[docs/upstream-sync.md](docs/upstream-sync.md) lists every intentional change
to upstream files.

### No Enterprise code

Upstream keeps its Enterprise-licensed code in `apps/client/src/ee`,
`packages/ee`, `packages/base-formula`, and the private `apps/server/src/ee`
submodule. docmost-teams deletes all of them and ships none of that code.
[`script/check-no-enterprise-code.sh`](script/check-no-enterprise-code.sh)
fails if any of those paths, a submodule, the Enterprise license text, or a
relative client import into an `ee/` folder appears; CI runs it first.

Fork features that upstream also sells are written without looking at
Docmost's Enterprise code, in any form: not the deleted folders, not git
history or old branches, not built bundles, and not copies online. Work from
the AGPL core, the fork's server code, and
[docs/teams-client-design.md](docs/teams-client-design.md).

### Client compat layer for `@/ee` imports

About 40 upstream client files import `@/ee/...`. Instead of editing them,
the import prefix `@/ee/` resolves to `apps/client/src/teams/ee-compat/`:

- `apps/client/tsconfig.json` maps `@/ee/*` next to `@/*`. TypeScript uses the
  longest matching prefix.
- `apps/client/vite.config.ts` and `apps/client/vitest.config.ts` add an
  `@/ee` key to `resolve.alias` ahead of `@`. Aliases apply in order, so the
  more specific key has to come first.

`teams/ee-compat` mirrors the module paths upstream imports, file names and
extensions included (`@/ee/utils.ts` is `ee-compat/utils.ts`, `@/ee/api-key`
is `ee-compat/api-key/index.ts`), with the exports and props the upstream
call sites use. Its modules stay thin:

- Features docmost-teams has (entitlements, SSO login, the Security & SSO
  page, the space sharing switch, the edition page) live in
  `apps/client/src/teams/<feature>/` and are re-exported from the compat
  module, so upstream files such as `App.tsx` need no edits.
- Features it doesn't have (AI, API keys, audit logs, MFA, SCIM, templates,
  page verification, page permissions, comment resolution, PDF export,
  bases, billing, cloud pages) are stubs: components render nothing, hooks do
  nothing, services resolve empty results, and routes show the shared "not
  available in docmost-teams" page. Stubs never make network requests.
- Fork code under `apps/client/src/teams` imports teams modules directly and
  never imports `@/ee/...`.

When an upstream release adds an `@/ee/...` import, the client type-check
reports it as a missing module (`TS2307`). Add a compat module at that path
the same way. Tests in `apps/client/src/teams` compare the client's copies of
server constants (feature keys, SSO presets and their defaults, SSO error
codes) with `apps/server/src`, so a server change that the client doesn't
follow fails `pnpm --filter ./apps/client run test`.

## Local development

1. Nothing to copy: the bootstrap helper in step 3 creates `.env` from
   `.env.example` on its first run and generates a random `APP_SECRET`. If you
   start the services manually instead, copy `.env.example` to `.env` and set
   `APP_SECRET` yourself (`openssl rand -hex 32`); the server won't start with
   the placeholder.

2. Install workspace dependencies from the repo root:

   ```bash
   corepack pnpm install
   ```

3. Run the local bootstrap helper from the repo root:

   ```bash
   bash script/bootstrap-local-dev.sh
   ```

   The helper:

   - starts Postgres, Redis, Keycloak, and the Keycloak client bootstrap
   - starts the backend if it isn't already running
   - waits for backend health on `http://localhost:3000`
   - creates or logs into the local Docmost admin workspace
   - creates or updates the local Keycloak OIDC provider in Docmost

   It starts these services:

   - Postgres 18 on `localhost:5432`
   - Redis on `localhost:6379`
   - Keycloak on `http://localhost:8081`
   - bootstrap jobs for Keycloak and the local Docmost setup

   The local Keycloak client accepts callbacks from Vite on ports `5173`,
   `5174`, and `5175`, and directly from the backend on port `3000`.

4. Start the frontend in another terminal:

   ```bash
   cd apps/client
   corepack pnpm dev
   ```

5. Open:

   - app: `http://localhost:3000`
   - Vite dev client: `http://localhost:5173`
   - Keycloak: `http://localhost:8081`

Notes:

- `script/bootstrap-local-dev.sh` is the recommended way to start.
- The helper starts the backend in the background when needed and writes logs
  to `.local-dev/server-dev.log`.
- `corepack pnpm dev` in `apps/client` only starts Vite on `localhost:5173`. It
  doesn't start the API server.
- Vite proxies `/api/*` to the backend on `localhost:3000`, so you'll see
  `ECONNREFUSED` if the backend isn't running.
- If the backend is already running, the helper reuses it and only runs the
  bootstrap steps.

To start everything manually instead:

```bash
docker compose -f docker-compose-dev.yml up -d
corepack pnpm run server:dev
python3 scripts/setup_docmost_local_auth.py
```

Default local credentials:

- Docmost admin: `admin@docmost.local` / `admin12345`
- Keycloak admin: `admin` / `admin`
- Keycloak test users: `admin` / `admin`, `user1` / `pass`, `user2` / `pass`

Useful commands:

```bash
docker compose -f docker-compose-dev.yml logs -f
```

```bash
docker compose -f docker-compose-dev.yml down
```

### SSO and private spaces locally

The local bootstrap enables private spaces and enforces SSO after configuring
Keycloak. It lists `Root` as the provider's owner group, so members of the
Keycloak `Root` group (matched case-insensitively) become workspace owners.
New providers have no owner or admin groups until an owner adds them.

New OIDC providers require an explicit `email_verified` claim by default. A
workspace owner can turn that requirement off in the provider settings when
the identity provider checks email ownership without emitting the claim. Only
owners can add, change, or test providers; admins see them read-only.

## Checks

Run these before opening a pull request. CI runs the same install, build, and
test steps.

```bash
git diff --check
bash script/check-no-enterprise-code.sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx run-many -t build --projects=server,client
corepack pnpm --filter ./apps/server exec jest --runInBand
corepack pnpm --filter ./apps/client run test
```

To check the release image locally:

```bash
docker build -t docmost-teams:local .
```

## Build and release flow

Two GitHub Actions workflows cover CI and publishing:

- [`ci.yml`](.github/workflows/ci.yml) runs on every pull request. It checks
  that no Enterprise code is present, installs with the frozen lockfile,
  builds the server and client, and runs the server and client tests on the
  Node version used by the release image.
- [`release.yml`](.github/workflows/release.yml) runs on pushes to `main` and
  `dev` and on `v*` tags. It runs `ci.yml` first, then builds a
  multi-architecture image (`linux/amd64`, `linux/arm64`) and pushes it to
  `ghcr.io/mesudip/docmost-teams`. Nothing is published if CI fails.
  - Branch pushes are tagged with the commit SHA.
  - Release tags are tagged with the version, the `major.minor` series for
    final releases, and `latest`.
- For tags, `release.yml` also creates the GitHub release. It uses the notes in
  `docs/releases/<tag>.md` and falls back to a pointer at the upstream release
  notes if that file doesn't exist.

### Versioning

docmost-teams mirrors upstream Docmost versions:

- `vX.Y.Z`: the fork's changes on top of upstream Docmost `vX.Y.Z`. The root
  `package.json` version must be `X.Y.Z`, and the release workflow refuses a tag
  that doesn't match.
- `vX.Y.Z-teams.N`: a fork-only fix released before the next upstream
  release.

Upstream's tags share the `v*` namespace, so fetch them under an `upstream/`
prefix and never push an upstream tag to `origin`:

```bash
git config remote.upstream.tagOpt --no-tags
git config --add remote.upstream.fetch '+refs/tags/*:refs/tags/upstream/*'
git fetch upstream
```

Run this once per clone. Upstream's `v0.96.0` is then available as
`upstream/v0.96.0`, and `v0.96.0` refers to the docmost-teams release.

### Cutting a release

1. Adopt the upstream release as described in
   [docs/upstream-sync.md](docs/upstream-sync.md), and get `main` green in CI.
2. Write the release notes in `docs/releases/vX.Y.Z.md` and commit them to
   `main`.
3. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "docmost-teams vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. Check that the release workflow published the image and the GitHub
   release.
