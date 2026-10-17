# Migrating between Docmost and docmost-teams

docmost-teams uses Docmost's database schema plus three migrations of its own,
so an existing database can move in either direction with one SQL script.
Each script runs in a single transaction and prints what it changes. With
`-v dry_run=1` it changes nothing, so it can run while the app is up.

Move to the same version or a newer one, and take the script from the
docmost-teams version you run or are moving to. Neither Docmost nor
docmost-teams starts on a database that a newer release has migrated.

## Docmost → docmost-teams

1. Dry-run [`script/migrate-from-upstream.sql`](../script/migrate-from-upstream.sql)
   and read what it reports.
2. Stop Docmost, back up the database, and run the script.
3. Switch the image to `ghcr.io/mesudip/docmost-teams:X.Y.Z` and start it.
4. Register the redirect URI the script printed for each OIDC provider, check
   that SSO sign-in works, then turn **Enforce SSO** back on if you used it.

The script turns off enforced SSO, disables SAML, LDAP and other non-OIDC
providers, which docmost-teams can't use, and turns off SCIM, which
docmost-teams doesn't have and which would block SSO group sync.

What changes after the switch:

- MFA isn't asked for at sign-in. The script counts users who set it up.
- Page-level permissions stay enforced, but can't be changed.
- Personal spaces become private spaces: only their creator sees them, and
  their public share links stop working.
- OIDC providers require a verified email unless you turn that off in the
  provider form. Group sync creates missing groups and only removes
  memberships it added itself.
- Data of other Enterprise features stays in the database, unused.

## docmost-teams → Docmost

1. Dry-run [`script/migrate-to-upstream.sql`](../script/migrate-to-upstream.sql).
   Give every space it lists a space admin: upstream gives workspace owners no
   access to spaces they aren't members of.
2. Stop docmost-teams, back up the database, and run the script.
3. Switch the image to `docmost/docmost:X.Y.Z` and start it.

The script:

- turns off enforced SSO and disables SSO providers, since Docmost has no SSO
  without an Enterprise license;
- keeps each member's oldest private space as their personal space and turns
  their other private spaces into ordinary spaces with the same single
  member, since Docmost allows one personal space per member;
- removes the docmost-teams SSO sync tables and migration records.

Users who only ever signed in through SSO have no password. The script counts
them; they need **Forgot password**, which requires email to be set up.

## Running a script

With the [`docker-compose.yml`](../docker-compose.yml) from this repository:

```bash
docker compose exec -T db psql -U docmost -d docmost -v dry_run=1 < script/migrate-to-upstream.sql
docker compose stop docmost
docker compose exec -T db pg_dump -U docmost -Fc docmost > docmost.dump
docker compose exec -T db psql -U docmost -d docmost < script/migrate-to-upstream.sql
```

Without Compose, pass `psql` the database URL from `DATABASE_URL`, minus any
`?schema=public` suffix. To restore the backup:

```bash
docker compose exec -T db pg_restore -U docmost -d docmost --clean --if-exists < docmost.dump
```
