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

Fork releases track tagged upstream releases. The fork is a single linear
series of commits on top of the upstream release tag it is based on, and a
sync rebases that series onto the next tag. The series is ordered so that
replaying it stays cheap:

- `chore: remove Docmost Enterprise code` (the second commit, after the one
  that makes upstream's server specs runnable) removes upstream's Enterprise
  code (`apps/client/src/ee`, `packages/ee`, `packages/base-formula`, the
  `apps/server/src/ee` submodule) and adds the client compat layer that
  upstream's `@/ee/...` imports resolve to. No other commit touches
  Enterprise paths.
- Fork features live in `apps/server/src/teams` and `apps/client/src/teams`.
  Upstream files carry only thin seams, without reformatting the lines around
  them, so upstream edits rarely conflict.

Keep a backup of the previous `main`, rebase, and publish with a lease:

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
Resolve conflicts commit by commit using the rules below:

- Upstream changes to Enterprise files, including the `apps/server/src/ee`
  submodule pointer, stop the removal commit as modify/delete conflicts. Keep
  them deleted without opening them, and port nothing from them:

  ```bash
  git diff --name-only --diff-filter=U -- apps/client/src/ee packages/ee packages/base-formula apps/server/src/ee .gitmodules |
    xargs -r git rm -q --
  ```

- For `pnpm-lock.yaml`, take the version being rebased onto with
  `git checkout --ours pnpm-lock.yaml && git add pnpm-lock.yaml`, and
  regenerate it at the end.
- Everything else follows [Intentional fork patches](#intentional-fork-patches).

### After the rebase

1. Remove Enterprise code upstream added since the last sync, which the
   replay doesn't know to delete, and fold the removal into the removal
   commit:

   ```bash
   removal=$(git log --format=%H --grep='^chore: remove Docmost Enterprise code$' upstream/vNEW..HEAD)
   bash script/check-no-enterprise-code.sh
   git rm -r -q --ignore-unmatch apps/client/src/ee packages/ee packages/base-formula apps/server/src/ee .gitmodules
   git commit --fixup="$removal"
   ```

   The check also fails when upstream starts depending on
   `@docmost/base-formula` again (a `package.json`, `tsconfig.json`, Jest
   mapping or `Dockerfile` line). Remove those references in the same fixup.
2. Regenerate the lockfile, commit it on its own, and install:

   ```bash
   corepack pnpm install --lockfile-only
   git add pnpm-lock.yaml && git commit -m "chore: update lockfile for upstream vNEW"
   corepack pnpm install --frozen-lockfile
   ```

3. Type-check the client. A new `@/ee/...` import shows up as a missing
   module (`TS2307`), and a changed call site as a type error against an
   existing compat module. Add or adjust the compat modules under
   `apps/client/src/teams/ee-compat/`, as described in
   [DEVELOPER.md](../DEVELOPER.md#client-compat-layer-for-ee-imports), using
   only the AGPL call sites, and commit them as fixups of the removal commit.
   New feature keys in the server's `common/features.ts` also need adding to
   `apps/client/src/teams/entitlement/features.ts`; its test compares them.

   ```bash
   corepack pnpm --filter ./apps/client exec tsc --noEmit
   ```

4. Squash the fixups into place without opening an editor:

   ```bash
   GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash upstream/vNEW
   ```

5. Run the [required verification](#required-verification). After review,
   publish with:

   ```bash
   git push --force-with-lease=main:<previous-origin-main-sha> origin main
   ```

Then cut the release as described in [DEVELOPER.md](../DEVELOPER.md#cutting-a-release).

## Intentional fork patches

Keep these decisions when resolving upstream conflicts. To see every upstream
file the fork changes, run
`git diff --diff-filter=M upstream/vNEW -- . ':!apps/server/src/teams' ':!apps/client/src/teams'`.
The `M` filter leaves out the deleted Enterprise files, so nothing of them is
printed.

- **No Enterprise code.** `apps/client/src/ee`, `packages/ee`,
  `packages/base-formula`, `.gitmodules`, and the `apps/server/src/ee` gitlink
  stay deleted, and nothing references `@docmost/base-formula`
  (`apps/*/package.json`, `apps/server/tsconfig.json`, the server's Jest
  mapping, `Dockerfile`). `script/check-no-enterprise-code.sh` enforces this
  in CI.
- **Client compat layer.** Upstream `@/ee/...` imports resolve to
  `apps/client/src/teams/ee-compat/` through the alias in
  `apps/client/tsconfig.json`, `vite.config.ts` and `vitest.config.ts`.
  `search-spotlight.tsx` imports its two AI modules through `@/ee/` instead of
  relative paths. Prefer a compat module over editing an upstream import.
- **Thin seams in upstream client files.** Fork client behavior stays under
  `apps/client/src/teams`. Upstream files only add an import and a component
  or a condition: the settings sidebar hides entries the server doesn't grant
  and limits General to admins, workspace settings are admin-only, the global
  sidebar pins private spaces and shows Invite to admins only, space lists
  show a lock on private spaces, space pages use the fork's space creation
  action, the Home tabs add a Personal tab, and the avatar menu drops
  upstream's single personal space entry.
- **Server.** `AppModule` statically imports `TeamsModule`; fork controllers
  and services stay under `apps/server/src/teams`. `LicenseCheckService`
  exposes `TEAMS_FEATURES` for self-hosted installs, and the tier is named
  `docmost-teams` (`apps/server/src/teams/features.ts`).
- **SSO.** Only workspace owners can create, change, test or delete SSO
  providers; admins can list them. A stored client secret is only sent to the
  issuer it was saved for, and the last enabled provider can't be disabled or
  deleted while SSO is enforced. New providers map no groups to workspace
  roles. Changing an email clears its verified mark in upstream's
  `UserService`, and SSO takes over (signs out, new password) an existing
  account whose email isn't verified before linking it.
- **Private spaces.** Membership can't be added, removed, or role-edited
  through the ordinary space-member endpoints; converting a space to private
  makes its only member a space admin. Private spaces are never public: page
  shares, share search and upstream public spaces reject them, public-space
  listings exclude them, converting a space to private deletes its shares and
  unpublishes it, and moving pages into one deletes their shares.
- **Owner access.** Workspace owners have administrative access to every
  ordinary space: the space ability, the space role and space id queries in
  `SpaceMemberRepo` (used by the editor, live updates, search and
  notifications), and the favorites and watcher cleanup all include them.
  Private spaces stay limited to their direct members, including for owners
  promoted through SSO owner groups.
- **Migrations.** The fork's migrations (private spaces, SSO sync provenance,
  explicit SSO owner groups) stay in the history even if upstream later adds
  similar ones, and both migrators set `allowUnorderedMigrations` so fork and
  upstream migrations can interleave.
- **Release and deployment.** `.github/workflows/release.yml` and
  `.github/workflows/ci.yml` are fork-owned. Release runs CI, publishes
  multi-architecture images to this fork's GHCR namespace, and creates the
  GitHub release. Don't replace them with upstream's Docker Hub/Enterprise
  release workflow. `docker-compose.yml` uses
  `ghcr.io/mesudip/docmost-teams:latest`.
- **Docs.** `README.md` and `DEVELOPER.md` are fork-owned. Keep the fork's
  versions when upstream changes its README.
- **Tests.** Upstream server specs that can't compile their module in
  isolation use `.useMocker(() => ({}))`, and the server's Jest config maps a
  few ESM-only packages to mocks under `apps/server/src/test/mocks`.

## Required verification

Upstream pins the package manager in `packageManager`; run it through corepack
so the pinned pnpm version is used. Node 24 or newer works locally, and the
release image builds on the Node version in `Dockerfile`.

```bash
git diff --check
bash script/check-no-enterprise-code.sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx run server:build --skip-nx-cache
corepack pnpm exec nx run client:build --skip-nx-cache
corepack pnpm --filter ./apps/server exec jest --runInBand
corepack pnpm --filter ./apps/client run test
docker build -t docmost-teams:sync-check .
```

Also run `bash script/bootstrap-local-dev.sh` and verify OIDC login, enforced
SSO, Root administration (a `Root` member edits pages in a space they aren't a
member of), and private-space creation before publishing the rebased `main`.
