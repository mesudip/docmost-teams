# Syncing from Docmost upstream

This repository is a product fork of `docmost/docmost`. Fork-owned features are
kept under `apps/server/src/teams` and `apps/client/src/teams` so upstream code
can be merged with a small, reviewable patch surface.

## One-time remote setup

```bash
git remote add upstream https://github.com/docmost/docmost.git
git config rerere.enabled true
```

If `upstream` already exists, verify it with `git remote -v` instead of adding
it again.

## Sync workflow

Never rebase or force-push `main`. Start from an up-to-date fork main and merge
the parent into a dated branch:

```bash
git fetch origin upstream --prune
git switch main
git pull --ff-only origin main
git switch -c codex/upstream-sync-YYYYMMDD
git merge --no-ff upstream/main
```

Resolve conflicts, run the checks below, push the sync branch, and merge it
through a pull request. Delete the sync branch after the PR is merged.

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
- Workspace owners have administrative access to every space, including
  private spaces, and the `Root` OIDC group promotes users to owner.
- `LicenseCheckService` exposes `TEAMS_FEATURES` for self-hosted installs.
- `.github/workflows/release.yml` publishes tagged multi-architecture images
  to this fork's GHCR namespace and must not be replaced by upstream's
  Docker Hub/Enterprise release workflow.
- The additive private-space migration stays in the migration history even if
  upstream later introduces a migration with similar behavior.

## Required verification

```bash
git diff --check
pnpm exec nx run server:build --skip-nx-cache
pnpm exec nx run client:build --skip-nx-cache
pnpm --filter ./apps/server exec jest --runInBand
pnpm --filter ./apps/client run test
```

Also run `bash script/bootstrap-local-dev.sh` and verify OIDC login, enforced
SSO, Root administration, and private-space creation before merging a sync PR.
