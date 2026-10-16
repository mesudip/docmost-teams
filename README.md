<div align="center">
    <h1><b>docmost-teams</b></h1>
    <p>
        Self-hosted Docmost for teams: single sign-on, private spaces, and
        ready-to-run container images.
        <br />
        <a href="#self-hosting"><strong>Self-hosting</strong></a> |
        <a href="#what-docmost-teams-adds"><strong>Features</strong></a> |
        <a href="DEVELOPER.md"><strong>Development</strong></a> |
        <a href="https://docmost.com/docs"><strong>Docmost documentation</strong></a>
    </p>
</div>
<br />

## About

[Docmost](https://github.com/docmost/docmost) is open-source collaborative wiki
and documentation software. Teams use it to write, organize, and share
knowledge together, with real-time collaborative editing, spaces, permissions,
groups, comments, page history, search, diagrams (Draw.io, Excalidraw, and
Mermaid), embeds, and translations into more than ten languages.

**docmost-teams is built to be self-hosted.** It runs on your own
infrastructure, keeps your data on your servers, and signs people in through
your own identity provider. Every docmost-teams release mirrors an upstream
Docmost release, with the additions listed below.

> **Don't want the hassle of running it yourself?** Use the managed version at
> [docmost.com](https://docmost.com).

## Credits

docmost-teams is built on the work of the [Docmost team](https://github.com/docmost/docmost)
and its contributors and translators. Thank you for building and
open-sourcing such an excellent product. If Docmost is useful to you, please
consider supporting the project at [docmost.com](https://docmost.com).

docmost-teams is an independent community project. It isn't affiliated with
or endorsed by Docmost.

## What docmost-teams adds

On top of the open-source Docmost release it mirrors, docmost-teams provides:

- **Single sign-on.** Sign in with Keycloak, Google, Microsoft Entra ID,
  Facebook, or any other OpenID Connect provider, using the authorization
  code flow with PKCE.
  - Each provider has a guided setup form with its callback URL, and a test
    button that checks the configuration before you enable it.
  - Optionally create accounts on first login.
  - Require a verified email claim. This is on by default; Microsoft and
    Facebook don't send that claim.
  - Restrict Google sign-in to one Google Workspace domain. Microsoft sign-in
    is limited to a single tenant.
  - Enforce SSO for the whole workspace. The last enabled provider can't be
    disabled or deleted while SSO is enforced.
  - Only workspace owners can add, change, or test providers; admins can view
    them. A provider decides who signs in as which account, so this keeps
    admins from granting themselves more access.
  - Sign-in matches existing accounts by email. If an account's email was
    changed in Docmost and never verified, its first SSO sign-in takes it
    over: its other sessions end and its password is replaced, so nobody
    can claim a colleague's address ahead of them.
- **Identity-provider group and role sync.** At every login, groups from a
  configurable claim (nested paths such as `realm_access.roles` work) are
  synced into Docmost groups, optionally filtered by wildcard patterns.
  Owner and admin groups grant workspace roles. Both lists start empty for
  new providers; group-sync providers created before role mapping existed
  keep their `Root` → owner rule as a visible setting. Docmost records what the provider
  assigned and removes only that when the user leaves the group, restoring
  their previous role. Memberships and roles assigned in Docmost are never
  removed.
- **Private spaces.**
  - Once an admin enables private spaces for the workspace, members can create
    any number of them, and only the creator can see each one.
  - Admins can convert a space with a single member into that member's private
    space, and the owner can convert it back.
  - Private spaces can't be shared publicly or published as public spaces.
    Moving a page into one removes its public share.
  - Workspace owners can't open other people's private spaces.
  - Membership of a private space can't be changed.
- **Owner access to workspace spaces.** Workspace owners administer every
  ordinary (non-private) space, and workspace settings are limited to admins.
- **Workspace security settings** in **Settings → Security & SSO**: allowed
  email domains for sign-ups, SSO sign-ins and invitations, a workspace-wide
  switch that turns off public sharing, and how long pages stay in the
  trash. Space admins can also turn off public sharing for a single space.
- **All of this for self-hosted installs**, without an upstream Enterprise
  license and without any Enterprise-licensed code.
- **Multi-architecture container images** (`linux/amd64`, `linux/arm64`)
  published to the GitHub Container Registry for every release.

## Self-hosting

Images are published to
[`ghcr.io/mesudip/docmost-teams`](https://github.com/mesudip/docmost-teams/pkgs/container/docmost-teams).
Each release is tagged with the Docmost version it mirrors (for example
`0.96.0`), and `latest` points to the newest release.

To start Docmost with Postgres and Redis:

1. Copy [`docker-compose.yml`](docker-compose.yml) to your server.
2. Set `APP_URL` to the URL people will use.
3. Set `APP_SECRET` to a random value of at least 32 characters, such as the
   output of `openssl rand -hex 32`.
4. Replace `STRONG_DB_PASSWORD` in both places.

Then run:

```bash
docker compose up -d
```

Open `APP_URL` and create your workspace. The upstream
[Docmost self-hosting documentation](https://docmost.com/docs/installation)
covers configuration, storage, email, and upgrades. It applies to
docmost-teams as well. To move an existing Docmost database to docmost-teams,
or back, see [docs/migrating.md](docs/migrating.md).

To sign in with SSO, open **Settings → Security & SSO** as a workspace owner,
choose **Add provider**, pick a preset, and fill in the form for that provider. The form
shows the provider's redirect URI,
`<APP_URL>/api/sso/oidc/<provider-id>/callback` (Facebook included), before
anything is saved, and **Test connection** checks the settings first.

## Releases

docmost-teams follows upstream Docmost versions. When Docmost publishes
`vX.Y.Z`, the fork's changes are rebased onto it and released as `vX.Y.Z`. A
fork-only fix between upstream releases ships as `vX.Y.Z-teams.N`. Release
notes are on the [releases page](https://github.com/mesudip/docmost-teams/releases).

## Development

See [DEVELOPER.md](DEVELOPER.md) for local development, the build and release
flow, and how upstream releases are adopted.

## License

Docmost core is licensed under the open-source AGPL 3.0 license, and so are
the docmost-teams additions in `apps/server/src/teams` and
`apps/client/src/teams`.

Upstream Docmost also has an Enterprise Edition under the Docmost Enterprise
license. docmost-teams ships none of its code:

- Upstream's Enterprise-licensed directories (`apps/client/src/ee`,
  `packages/ee`, `packages/base-formula`) and the private `apps/server/src/ee`
  submodule are deleted. CI runs
  [`script/check-no-enterprise-code.sh`](script/check-no-enterprise-code.sh),
  which fails if any of them, or the Enterprise license text, comes back.
- The features listed above are written independently for this fork. The
  client side was rebuilt clean-room from
  [`docs/teams-client-design.md`](docs/teams-client-design.md).
- Upstream files that import `@/ee/...` resolve to the fork's own modules in
  `apps/client/src/teams/ee-compat`.

Features upstream sells only in its Enterprise Edition and that docmost-teams
doesn't reimplement, such as AI, API keys, audit logs, MFA, SCIM, templates,
and database pages, aren't available. Their screens say so instead of asking
for a license.
