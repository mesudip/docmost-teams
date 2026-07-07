# Docmost Teams Fork

Docmost is a collaborative wiki and documentation app with spaces, pages, groups, permissions, search, comments, and real-time editing. This fork adds a local `teams` extension area for enterprise/team-focused features while keeping the upstream `ee` folder separate so upstream changes remain easier to pull.

## What is different in this fork

- Local enterprise code lives in `apps/server/src/teams`.
- The server attempts to load both upstream EE code and the local teams module.
- Generic OIDC login is available through the teams SSO module and is intended to work with Keycloak or any standards-compliant OIDC provider.
- The existing Docmost SSO settings UI can be used to create and configure an OIDC provider.

## Run the fork with Docker

Build and run this fork instead of the upstream image:

```yaml
services:
  docmost:
    build: .
    depends_on:
      - db
      - redis
    environment:
      APP_URL: "http://localhost:3000"
      APP_SECRET: "replace-with-at-least-32-random-characters"
      DATABASE_URL: "postgresql://docmost:STRONG_DB_PASSWORD@db:5432/docmost"
      REDIS_URL: "redis://redis:6379"
    ports:
      - "3000:3000"
    volumes:
      - docmost:/app/data/storage
```

Then start the stack:

```bash
docker compose up --build
```

Open Docmost at `http://localhost:3000`, create the first workspace/admin user, then configure SSO from workspace settings.

## Run Keycloak in Docker for local OIDC testing

For local testing, use a hostname that both your browser and Docker containers can resolve. The example below uses `keycloak.localhost`.

Add this to `/etc/hosts` on your machine:

```text
127.0.0.1 keycloak.localhost
```

Add Keycloak to `docker-compose.yml`:

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    command: ["start-dev", "--hostname=http://keycloak.localhost:8080"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    networks:
      default:
        aliases:
          - keycloak.localhost
```

Start Docmost and Keycloak:

```bash
docker compose up --build
```

Open the Keycloak admin console at `http://keycloak.localhost:8080` and sign in with `admin` / `admin`.

## Configure Keycloak

1. Create a realm named `docmost`.
2. Create an OpenID Connect client named `docmost`.
3. Enable the standard authorization-code flow.
4. Set client authentication to enabled/confidential.
5. Add this valid redirect URI:

   ```text
   http://localhost:3000/api/sso/oidc/*/callback
   ```

6. Add this web origin:

   ```text
   http://localhost:3000
   ```

7. Save the client and copy its client secret.
8. Create at least one Keycloak user with an email address.

## Configure Docmost OIDC

In Docmost, go to workspace settings and open the security/SSO area.

Create an OIDC provider with:

- Display name: `Keycloak`
- Issuer URL: `http://keycloak.localhost:8080/realms/docmost`
- Client ID: `docmost`
- Client secret: the Keycloak client secret
- Allow signup: enabled if you want Keycloak users to be created automatically in Docmost
- Enabled: enabled

After saving, Docmost will show a callback URL for the provider. You can replace the wildcard redirect URI in Keycloak with that exact callback URL if you prefer a stricter Keycloak client configuration.

## Login flow

1. Visit `http://localhost:3000/login`.
2. Click the Keycloak/SSO login button.
3. Authenticate in Keycloak.
4. Keycloak redirects back to Docmost at `/api/sso/oidc/<provider-id>/callback`.
5. Docmost links or creates the user, creates a normal Docmost session, and redirects to the app.

## Development commands

```bash
pnpm install
pnpm run editor-ext:build
pnpm --filter ./apps/client run test
pnpm --filter ./apps/server exec jest --runInBand
pnpm run server:build
pnpm run client:build
```

At the time of this README update, the client Vitest suite runs successfully. The server Jest suite currently has existing setup/module-resolution failures unrelated to the teams OIDC README change; fix those before treating server tests as a reliable gate.

## Notes

- Use a strong `APP_SECRET`; OIDC state and Docmost sessions depend on it.
- In production, use HTTPS URLs for both Docmost and Keycloak.
- Keep custom fork code in `apps/server/src/teams` when possible to reduce conflicts with upstream Docmost and the upstream EE submodule.
