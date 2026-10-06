# Syncing from Docmost upstream

This repository is a product fork of `docmost/docmost`. Fork-owned features are
kept under `apps/server/src/teams` and `apps/client/src/teams` so upstream code
can be merged with a small, reviewable patch surface.

## One-time remote setup

```bash
git remote add upstream https://github.com/docmost/docmost.git
git config remote.upstream.tagOpt --no-tags
git config --add remote.upstream.fetch '+refs/tags/*:refs/tags/upstream/*'
git config rerere.enabled true
```

docmost-teams release tags reuse upstream version numbers, so upstream tags are
fetched as `upstream/vX.Y.Z` to keep them apart from fork tags.

If `upstream` already exists, verify it with `git remote -v` instead of adding
it again.

## Sync workflow

Fork releases track tagged upstream releases. The fork patch is kept as a
linear series of commits on top of the upstream release tag it is based on, so
a sync rebases that series onto the next tag. Keep a backup of the previous
`main` and publish with a lease:

```bash
git fetch origin
git fetch upstream
git switch main
git pull --ff-only origin main
git branch backup/main-pre-vNEW HEAD
git rebase --onto upstream/vNEW upstream/vOLD main
```

`vOLD` is the upstream release the current `main` is based on (the version in
the root `package.json`), and `vNEW` is the upstream release being adopted.
Resolve conflicts commit by commit using the rules below, then regenerate the
lockfile with `corepack pnpm install --lockfile-only` and run the checks. After
review, publish with:

```bash
git push --force-with-lease=main:<previous-origin-main-sha> origin main
```

Then cut the release as described in [DEVELOPER.md](../DEVELOPER.md#cutting-a-release).

## Intentional fork patches

Keep these decisions when resolving upstream conflicts:

- `.gitmodules` and the `apps/server/src/ee` gitlink stay deleted. This fork
  does not fetch or build the private upstream Enterprise repository.
- `AppModule` statically imports `TeamsModule`; fork controllers and services
  stay under `apps/server/src/teams`.
- Fork client behavior stays under `apps/client/src/teams`; upstream files
  should contain only thin imports or rendering seams.
- Private-space membership cannot be added, removed, or role-edited through
  the ordinary space-member endpoints.
- Workspace owners have administrative access to every ordinary workspace
  space. Personal spaces are accessible only to their direct members; this
  also applies to owners promoted through the `Root` OIDC group.
- Personal spaces are never public: page shares and upstream public spaces
  reject them, public-space listings exclude them, and converting a space to
  personal deletes its shares and unpublishes it.
- `LicenseCheckService` exposes `TEAMS_FEATURES` for self-hosted installs.
- `.github/workflows/release.yml` and `.github/workflows/ci.yml` are
  fork-owned. Release runs CI, publishes multi-architecture images to this
  fork's GHCR namespace, and creates the GitHub release. Don't replace them
  with upstream's Docker Hub/Enterprise release workflow.
- `docker-compose.yml` uses `ghcr.io/mesudip/docmost-teams:latest`.
- The self-hosted license tier is named `docmost-teams`
  (`apps/server/src/teams/features.ts`).
- `README.md` and `DEVELOPER.md` are fork-owned. Keep the fork's versions
  when upstream changes its README.
- The additive private-space migration stays in the migration history even if
  upstream later introduces a migration with similar behavior.

## Required verification

Upstream pins the package manager in `packageManager`; run it through corepack
so the pinned pnpm version is used. Node 24 or newer works locally, and the
release image builds on the Node version in `Dockerfile`.

```bash
git diff --check
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx run server:build --skip-nx-cache
corepack pnpm exec nx run client:build --skip-nx-cache
corepack pnpm --filter ./apps/server exec jest --runInBand
corepack pnpm --filter ./apps/client run test
docker build -t docmost-teams:sync-check .
```

Also run `bash script/bootstrap-local-dev.sh` and verify OIDC login, enforced
SSO, Root administration, and private-space creation before publishing the
rebased `main`.
