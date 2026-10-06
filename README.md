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

- **OpenID Connect single sign-on.** Connect Keycloak or any other OIDC
  provider, using the authorization code flow with PKCE.
  - Optionally create accounts on first login.
  - Require a verified email claim, on by default.
  - Enforce SSO for the whole workspace.
- **Identity-provider group sync.** Groups in the provider's `groups` claim
  (configurable) are synced into Docmost groups at login. Members of a `Root`
  group become workspace owners.
- **Private spaces.**
  - Once an admin enables private spaces for the workspace, members can create
    any number of them, and only the creator can see each one.
  - Admins can convert a space with a single member into that member's private
    space, and the owner can convert it back.
  - Private spaces can't be shared publicly or published as public spaces.
  - Workspace owners can't open other people's private spaces.
  - Membership of a private space can't be changed.
- **Owner access to workspace spaces.** Workspace owners administer every
  ordinary (non-private) space, and workspace settings are limited to admins.
- **Security settings and SSO for self-hosted installs**, without the upstream
  enterprise license or the private enterprise submodule.
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
docmost-teams as well.

To sign in with SSO, open **Settings → Security**, add an OIDC provider, and
register `<APP_URL>/api/sso/oidc/<provider-id>/callback` as the redirect URI
with your identity provider.

## Releases

docmost-teams follows upstream Docmost versions. When Docmost publishes
`vX.Y.Z`, the fork's changes are rebased onto it and released as `vX.Y.Z`. A
fork-only fix between upstream releases ships as `vX.Y.Z-teams.N`. Release
notes are on the [releases page](https://github.com/mesudip/docmost-teams/releases).

## Development

See [DEVELOPER.md](DEVELOPER.md) for local development, the build and release
flow, and how upstream releases are adopted.

## License

Docmost core is licensed under the open-source AGPL 3.0 license.
Enterprise features are available under an enterprise license (Enterprise Edition).

All files in the following directories are licensed under the Docmost
Enterprise license defined in `packages/ee/License`:

- apps/client/src/ee
- packages/ee
