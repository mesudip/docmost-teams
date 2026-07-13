<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

## Getting started

To get started with Docmost, please refer to our [documentation](https://docmost.com/docs) or try our [cloud version](https://docmost.com/pricing) .

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

### License

Docmost core is licensed under the open-source AGPL 3.0 license.  
Enterprise features are available under an enterprise license (Enterprise Edition).

All files in the following directories are licensed under the Docmost Enterprise license defined in `packages/ee/License`.

- apps/client/src/ee
- packages/ee

### Contributing

See the [development documentation](https://docmost.com/docs/self-hosting/development)

## Local development

This repo is a `pnpm` workspace managed with `nx`.
Do not run `npm install` inside `apps/client`, `apps/server`, or `packages/*`.
Install dependencies once from the repo root.

Quick startup:

1. Copy the local env file:

```bash
cp .env.example .env
```

2. Install workspace dependencies from the repo root:

```bash
pnpm install
```

3. Run the local bootstrap helper from the repo root:

```bash
bash script/bootstrap-local-dev.sh
```

This will:

- start Postgres, Redis, Keycloak, and the Keycloak client bootstrap
- start the backend if it is not already running
- wait for backend health on `http://localhost:3000`
- create or log into the local Docmost admin workspace
- create or update the local Keycloak OIDC provider in Docmost

Infrastructure started by the helper:

- Postgres 18 on `localhost:5432`
- Redis on `localhost:6379`
- Keycloak on `http://localhost:8081`
- bootstrap jobs for Keycloak and local Docmost setup

The local Keycloak client accepts callbacks from Vite on ports `5173`, `5174`, and `5175`, as well as directly from the backend on port `3000`.

4. Start the frontend in another terminal:

```bash
cd apps/client
pnpm dev
```

5. Open:

- app: `http://localhost:3000`
- Vite dev client: `http://localhost:5173`
- Keycloak: `http://localhost:8081`

Notes:

- `script/bootstrap-local-dev.sh` is the recommended startup flow for this fork.
- The helper starts the backend in the background when needed and writes logs to `.local-dev/server-dev.log`.
- `apps/client/pnpm dev` only starts Vite on `localhost:5173`. It does not start the API server.
- The Vite client proxies `/api/*` to the backend on `localhost:3000`, so if the backend is not running you will see `ECONNREFUSED`.
- If you already have the backend running, the helper will reuse it and only run the bootstrap steps.
- Manual fallback:

```bash
docker compose -f docker-compose-dev.yml up -d
pnpm run server:dev
python3 scripts/setup_docmost_local_auth.py
```

Default local credentials:

- Docmost admin: `admin@docmost.local` / `admin12345`
- Keycloak admin: `admin` / `admin`
- Keycloak test users: `admin` / `admin`, `user1` / `pass`, `user2` / `pass`

Useful commands:

```bash
docker compose -f docker-compose-dev.yml down
docker compose -f docker-compose-dev.yml logs -f
```

OIDC SSO is implemented under the fork-owned `apps/server/src/teams/sso` module; this fork does not depend on the upstream enterprise submodule. New providers require an explicit `email_verified` claim by default. An administrator can disable that requirement in the provider settings when the identity provider verifies email ownership through its own policy without emitting the claim.

The local bootstrap enables private spaces and enforces SSO after configuring Keycloak. OIDC group sync maps members of the case-insensitive `Root` group to the Docmost workspace owner role.

Pushing a semantic version tag such as `v1.2.3` publishes multi-architecture images to GHCR with the `1.2.3` and `latest` tags.

## Thanks

Special thanks to;

<img width="100" alt="Crowdin" src="https://github.com/user-attachments/assets/a6c3d352-e41b-448d-b6cd-3fbca3109f07" />

[Crowdin](https://crowdin.com/) for providing access to their localization platform.

<img width="48" alt="Algolia-mark-square-white" src="https://github.com/user-attachments/assets/6ccad04a-9589-4965-b6a1-d5cb1f4f9e94" />

[Algolia](https://www.algolia.com/) for providing full-text search to the docs.
