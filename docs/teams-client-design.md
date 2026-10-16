# docmost-teams client: clean-room design

This document specifies the client features docmost-teams adds on top of the
open-source Docmost client. It was written from the fork's own server code,
the AGPL-licensed core client, and the fork's product requirements. It
contains no code from Docmost's Enterprise-licensed client, and the
implementation must be written from this document alone.

## 1. Background

Upstream Docmost keeps the client half of its Enterprise Edition in
`apps/client/src/ee`, under the Docmost Enterprise License. Earlier
docmost-teams commits edited those files, and copied some into
`apps/client/src/teams`, to enable SSO, security settings and private spaces
without a license, and shipped them in public images. This branch deletes
`apps/client/src/ee` and every fork file derived from it (see section 10), and
rebuilds what the fork needs from this design.

## 2. Clean-room rules for the implementer

You implement from this document, the AGPL core client, and the fork's
server code. You must not see Docmost Enterprise client code in any form.

- Do not open, read, list, search or diff any path named `apps/client/src/ee`
  in any checkout or worktree, and do not look at the files listed in
  section 10 anywhere they still exist.
- Do not use git history. Allowed git commands: `git status`, `git diff` and
  `git diff --cached` (working tree against this branch's HEAD), `git add`,
  `git commit`, and `git log --oneline` (subjects only). Not allowed:
  `git show`, `git log -p`, `git diff <commit>`, `git blame`, checking out or
  restoring other refs, `git stash`, `git worktree`.
- Do not read built client bundles anywhere: `apps/client/dist` in any
  checkout, `node_modules/.vite`, or the JavaScript served by running
  instances such as `http://localhost:3100`. They contain compiled enterprise
  code.
- Do not look up Docmost enterprise code online (`docmost/docmost` under
  `apps/client/src/ee`, `docmost/ee`, forks, mirrors, CDNs).
- Do not reproduce enterprise code from memory. Design the components,
  names inside them, layout and wording yourself.
- Where this document is silent, decide yourself and record the decision in
  your final report. Never resolve a question by looking at enterprise code.

You may read everything else: the core client under `apps/client/src`
(outside `ee`), the remaining fork files under `apps/client/src/teams`, all
server code under `apps/server/src` (including the fork's
`apps/server/src/teams`), `packages/editor-ext`, and
the docs.

Do not change server code. This work is client-only, plus the docs and CI
changes in section 9.

## 3. Architecture

### 3.1 Compat alias for upstream imports

About 40 core (upstream, AGPL) client files import from `@/ee/...`. Editing
all of them would make every upstream sync conflict. Instead:

- Map the import prefix `@/ee/` to `apps/client/src/teams/ee-compat/` in all
  three resolvers:
  - `apps/client/tsconfig.json`: add a `paths` entry for `@/ee/*` next to
    `@/*`. TypeScript picks the longest matching prefix.
  - `apps/client/vite.config.ts` and `apps/client/vitest.config.ts`: add an
    `@/ee` key to `resolve.alias` ahead of `@` (aliases apply in order).
- Under `teams/ee-compat/`, create exactly the module paths core imports (the
  table in section 4), with the export names and signatures the core call
  sites need. Keep the file names and extensions as imported: `@/ee/utils.ts`
  needs `ee-compat/utils.ts`, and `@/ee/api-key` needs
  `ee-compat/api-key/index.ts`.
- Compat files stay thin. Stubs for unsupported features can live directly in
  them. Real features live under `apps/client/src/teams/<feature>/` and are
  re-exported from the compat file.
- Fork code (`apps/client/src/teams/**`) imports teams modules directly and
  never imports `@/ee/...`.
- One core file uses relative imports into the deleted folder:
  `features/search/components/search-spotlight.tsx` imports
  `../../../ee/ai/hooks/use-ai-search.ts` and
  `../../../ee/ai/components/ai-search-result.tsx`. Change only those two
  specifiers to `@/ee/ai/hooks/use-ai-search.ts` and
  `@/ee/ai/components/ai-search-result.tsx`.

To find each signature, read the core call sites (they are AGPL). If a core
file passes props or reads fields, the compat export must accept and provide
them with compatible types.

### 3.2 Real features live under `apps/client/src/teams/`

Suggested layout (adjust as you see fit):

- `teams/entitlement/`: features list, entitlement types, the atom, the
  entitlements query, the `useHasFeature` hook and the edition label hook.
  `tier.utils.ts` is already there; keep it.
- `teams/security/`: the Security & SSO settings page, SSO provider
  management, the login-page SSO block and error messages, and the space
  sharing toggle.
- `teams/private-space/`: existing fork files plus the rewritten ones from
  section 6.7.
- `teams/edition/`: the edition page and the "not available in this edition"
  placeholder.

### 3.3 Core seams that must keep working

These core files import fork modules. Keep the same path and export, or
update the import with a minimal change:

| Core file | Imports |
| --- | --- |
| `components/layouts/global/global-sidebar.tsx` | `PinnedPersonalSpaces` (kept file), `usePinnedPersonalSpaceIds` from `@/teams/private-space/queries/private-space-query` |
| `features/home/components/home-tabs.tsx` | `PersonalPagesTab` and `PersonalPagesPanel` (kept file) |
| space list, carousel, switcher, select, all-spaces list | `PrivateSpaceIndicator` (kept file) |
| `features/space/components/space-details.tsx` | `PersonalSpaceConversion` (kept file) |
| `pages/spaces/spaces.tsx`, `pages/settings/space/spaces.tsx` | `SpaceCreationAction` (kept file) |
| `components/settings/settings-sidebar.tsx` | `hasPaidLicenseTier` from `@/teams/entitlement/tier.utils` (kept file) |

The kept files import modules you will rewrite:

- `space-creation-action.tsx` imports the named export `PrivateSpaceForm`
  (props `{ onCreated?: () => void }`) from `./create-private-space-modal`.
- `pinned-personal-spaces.tsx` imports the default export of
  `./create-private-space-modal` (a modal, props `{ opened, onClose }`) and
  `useMyPersonalSpacesQuery` from the private-space queries.
- `personal-space-conversion.tsx` imports `convertPersonalSpace` from
  `../services/private-space-service`.
- All kept files import `Feature` and `useHasFeature` from `@/ee/...`; switch
  them to the teams entitlement modules.

## 4. Compat module contract

Every module below must exist under `teams/ee-compat/`. In the behaviour
column:

- **REAL**: implement per section 6.
- **NULL**: a component that renders nothing.
- **NOOP**: a hook or function that does nothing.
- **EMPTY**: an async function that resolves with an empty result without
  making a network request.
- **PLACEHOLDER**: a page component that renders the shared "not available
  in this edition" page (section 6.11).

| Import specifier | Exports needed by core | Behaviour |
| --- | --- | --- |
| `@/ee/features`, `@/ee/features.ts` | `Feature` | REAL: constants identical in keys and values to the server's `apps/server/src/common/features.ts` |
| `@/ee/hooks/use-feature`, `.ts` | `useHasFeature(feature)` | REAL (6.1) |
| `@/ee/hooks/use-upgrade-label`, `.ts` | `useUpgradeLabel()` | REAL (6.2) |
| `@/ee/entitlement/entitlement-atom` | `entitlementAtom` | REAL (6.1) |
| `@/ee/entitlement/use-entitlements` | `useEntitlements()` | REAL (6.1) |
| `@/ee/components/sso-login.tsx` | default component | REAL (6.3) |
| `@/ee/security/pages/security.tsx` | default page | REAL (6.4): re-export the teams Security & SSO page, so core `App.tsx` stays unchanged |
| `@/ee/security/types/security.types.ts` | `IAuthProvider` type | REAL (6.5) |
| `@/ee/personal-space/components/personal-spaces-setting.tsx` | default component | REAL (6.7): re-export the teams private spaces setting |
| `@/ee/security/services/security-service.ts` | `getSsoProviders()` | REAL (6.5) |
| `@/ee/security/components/space-public-sharing-toggle.tsx` | default component `{ space }` | REAL (6.6) |
| `@/ee/security/components/space-viewer-comments-toggle.tsx` | default component `{ space }` | NULL (needs `Feature.VIEWER_COMMENTS`, which this edition lacks) |
| `@/ee/security/components/allow-member-templates.tsx` | default component | NULL |
| `@/ee/page-permission` | `PageShareModal({ readOnly })` | REAL: render the core public-sharing control, the default export of `@/features/share/components/share-modal`, with the same `readOnly`. Without this, pages lose their Share button. No page-level permissions UI. |
| `@/ee/licence/pages/license.tsx` | default page | REAL: edition page (6.9) |
| `@/ee/licence/services/license-service.ts` | `getLicenseInfo()` | EMPTY (resolve `null`) |
| `@/ee/hooks/use-trial.tsx` | default `useTrial()` | returns `{ isTrial: false, trialDaysLeft: null }` |
| `@/ee/hooks/use-trial-end-action.tsx` | `useTrialEndAction()` | NOOP |
| `@/ee/hooks/use-redirect-to-cloud-select.tsx` | `useRedirectToCloudSelect()` | NOOP |
| `@/ee/components/posthog-user.tsx` | `PosthogUser` | NULL |
| `@/ee/components/sso-cloud-signup.tsx` | default component | NULL |
| `@/ee/components/manage-hostname.tsx` | default component | NULL |
| `@/ee/utils.ts` | `getHostnameUrl(hostname)`, `exchangeTokenRedirectUrl(hostname, token)` | Cloud-only and never reached when self-hosted. Return `window.location.origin`. |
| `@/ee/billing/services/billing-service.ts` | `getBilling()`, `getBillingPlans()` | EMPTY (`null` and `[]`) |
| `@/ee/billing/pages/billing.tsx` | default page | PLACEHOLDER |
| `@/ee/pages/cloud-login.tsx`, `@/ee/pages/create-workspace.tsx`, `@/ee/pages/verify-email.tsx` | default pages | PLACEHOLDER |
| `@/ee/pdf-export/pdf-render-page.tsx` | default page | PLACEHOLDER |
| `@/ee/mfa` | `MfaSettings` | NULL |
| `@/ee/mfa/pages/mfa-challenge-page` | `MfaChallengePage` (named) | PLACEHOLDER |
| `@/ee/mfa/pages/mfa-setup-required-page` | `MfaSetupRequiredPage` (named) | PLACEHOLDER |
| `@/ee/api-key` | `getApiKeys(params)`, `IApiKey` type | EMPTY (an empty page of results in the shape core's pagination types expect); a minimal `IApiKey` type |
| `@/ee/api-key/pages/user-api-keys`, `@/ee/api-key/pages/workspace-api-keys` | default pages | PLACEHOLDER |
| `@/ee/audit/services/audit-service` | `getAuditLogs(params)` | EMPTY (empty page) |
| `@/ee/audit/pages/audit-logs.tsx` | default page | PLACEHOLDER |
| `@/ee/page-verification` | `PageVerificationBadge`, `PageVerificationMenuItem`, `PageVerificationModal` | NULL (accept the props passed at the call sites) |
| `@/ee/page-verification/services/page-verification-service` | `getVerificationList(params)` | EMPTY (empty page) |
| `@/ee/page-verification/pages/verified-pages.tsx` | default page | PLACEHOLDER |
| `@/ee/scim/services/scim-token-service` | `getScimTokens(params)` | EMPTY (empty page) |
| `@/ee/comment/components/resolve-comment` | default component | NULL |
| `@/ee/comment/queries/comment-query` | `useResolveCommentMutation()` | A react-query mutation whose function rejects with a "not available" error. It is only reachable when `COMMENT_RESOLUTION` is granted, which it never is. |
| `@/ee/base/components/base-view` | `BaseView` | REAL-lite: a bordered notice that database pages ("bases") are not available in docmost-teams. Render `titleSlot` above it when given. |
| `@/ee/base/components/base-table-skeleton` | `BaseTableSkeleton({ rows, columns })` | A simple loading skeleton |
| `@/ee/base/queries/base-query` | `useBaseQuery(pageId)`, `useConvertPageToBaseMutation()` | A disabled query (no request; not loading, not error), and a mutation that rejects |
| `@/ee/base/pages/base-page.tsx` | default page | PLACEHOLDER |
| `@/ee/ai/components/editor/ai-menu/ai-menu` | `EditorAiMenu({ editor })` | NULL |
| `@/ee/ai/services/ai-search-service.ts` | `hintVectorCache()` | NOOP |
| `@/ee/ai/hooks/use-ai-search.ts` | `useAiSearch()` | Returns an inert object with every field `search-spotlight.tsx` destructures (no data, not pending, no error, empty streaming answer and sources, no-op functions) |
| `@/ee/ai/components/ai-search-result.tsx` | `AiSearchResult` | NULL |
| `@/ee/ai/pages/ai-settings.tsx` | default page | PLACEHOLDER |
| `@/ee/ai-chat/components/chat-input` | default component | NULL (the caller only renders it when AI chat is on, which it never is) |
| `@/ee/ai-chat/types/ai-chat.types` | `PageMention`, `ChatAttachment` types | Minimal object types that satisfy `home-ai-prompt.tsx` |
| `@/ee/ai-chat/components/aside-chat-panel`, `@/ee/ai-chat/components/ai-chat-sidebar.tsx` | default components | NULL |
| `@/ee/ai-chat/pages/ai-chat.tsx` | default page | PLACEHOLDER |
| `@/ee/oauth/pages/oauth-consent.tsx` | default page | PLACEHOLDER |
| `@/ee/template/components/template-picker-modal` | default component | NULL |
| `@/ee/template/pages/template-list`, `@/ee/template/pages/template-editor` | default pages | PLACEHOLDER |

When the build reports an `@/ee/...` import that this table missed, add it the
same way and list it in your report.

## 5. What the server provides

All endpoints are `POST` under `/api` and return JSON. The client already prefixes
`/api` (see `apps/client/src/lib/api-client.ts`). The source of truth is
the server code named in each item.

### 5.1 Entitlements
`/workspace/entitlements` returns `{ cloud: boolean, tier: string, features: string[] }`.
See `apps/server/src/core/workspace/controllers/workspace.controller.ts`. In
docmost-teams the tier is `docmost-teams`, and `features` lists exactly
`security:settings`, `sso:custom` and `spaces:personal`
(`apps/server/src/teams/features.ts`).

### 5.2 Workspace settings
`/workspace/update` takes any subset of these fields
(`apps/server/src/core/workspace/dto/update-workspace.dto.ts`):

- `enforceSso: boolean`: rejected with 400 unless at least one provider is
  enabled.
- `emailDomains: string[]`: the server normalizes the entries. When the list
  is non-empty, sign-ups, SSO logins and invitations must use one of these
  domains.
- `disablePublicSharing: boolean`: needs `security:settings`. Stored as
  `settings.sharing.disabled`.
- `trashRetentionDays: integer ≥ 1`: needs `security:settings`. The server
  uses 30 when unset.
- `allowPersonalSpaces: boolean`: needs `spaces:personal`. Stored as
  `settings.spaces.allowPersonal`.

The response is the updated workspace. Read the current values from the
workspace the client already holds (`IWorkspace` in
`apps/client/src/features/workspace/types/workspace.types.ts`). Follow how the
core settings components update and refresh workspace state, for example
`features/workspace/components/settings/components/allow-public-spaces.tsx`
and `workspace-default-page-edit-mode.tsx`.

### 5.3 Space settings
`/spaces/update` with `{ spaceId, disablePublicSharing }` needs
`security:settings` and space admin rights. Stored as
`space.settings.sharing.disabled`. Use the core space update mutation so the
cached space keeps its `membership`.

### 5.4 SSO providers
See `apps/server/src/teams/sso/sso.controller.ts`, `sso-provider.dto.ts`,
`sso.service.ts` and `sso-presets.ts`. Listing and reading providers need
a workspace admin or owner; creating, updating, testing and deleting them
need an owner, and admins see the providers read-only.

- `/sso/providers` → `{ items: Provider[], meta }`. A `Provider` has `id`,
  `name`, `type` (always `oidc` for providers this fork creates), `oidcIssuer`,
  `oidcClientId`, `allowSignup`, `isEnabled`, `groupSync`, `settings`,
  `hasOidcClientSecret`, `createdAt` and `updatedAt`. The secret itself is
  never returned.
- `/sso/info { providerId }` → `Provider`.
- `/sso/create`:
  - Body: `{ id, type: 'oidc', preset, name, oidcIssuer?, oidcClientId?, oidcClientSecret?, allowSignup?, isEnabled?, groupSync?, settings? }`.
  - `id` is a client-generated UUID, so the callback URL is known before
    saving.
  - The server fills every omitted setting from the preset's defaults, in a
    single insert.
  - It returns 400 if `isEnabled` is set while required fields are missing
    (the message names them), and 400 if the id already exists.
- `/sso/update { providerId, ...changed fields }`:
  - A blank or omitted `oidcClientSecret` keeps the stored secret.
  - The same completeness rule applies when the provider is enabled.
  - The preset can't change.
- `/sso/test`:
  - Body: the same fields as update, plus `providerId` for a saved provider
    or `preset` for an unsaved draft.
  - Unsaved values override stored ones, and a blank secret uses the stored
    secret.
  - Returns `{ ok, message, issuer?, authorizationEndpoint?, tokenEndpoint?, userinfoEndpoint?, tokenAuthMethod?, credentials: 'valid' | 'invalid' | 'unknown', warnings: string[] }`.
- `/sso/delete { providerId }`.
- `settings` keys and their validation are in `SsoProviderSettingsDto`.
  Preset rules and defaults are in `SSO_PRESET_DEFINITIONS`, `resolveIssuer`
  and `getMissingConfig`.
- The callback URL to register at the identity provider is
  `<APP_URL>/api/sso/oidc/<id>/callback`.
- Login starts at `<APP_URL>/api/sso/oidc/<id>/login?redirect=<path>`.
- Failures come back to `/login?sso_error=<code>`. The codes are listed in
  `apps/server/src/teams/sso/sso-login-error.ts`.
- The public workspace data (`/workspace/public`, `getWorkspacePublicData` in
  the client) lists each enabled provider as `{ id, name, type, preset }`,
  plus `enforceSso`.

### 5.5 Private spaces
See `apps/server/src/teams/private-space/`.

- `/spaces/private/create { name }`:
  - `name` is trimmed and must be 2–100 characters.
  - Returns 403 when the workspace setting is off.
  - Returns the new space.
- `/spaces/private/mine` → `[{ id, name, slug, logo }]`: the caller's own
  private spaces.
- `/spaces/private/convert { spaceId, isPersonal }` returns the bare space
  row, without `membership`.
  - Making a space personal needs workspace admin rights and exactly one
    direct user member.
  - Making a personal space ordinary needs space admin rights on it.

## 6. Features to build

### 6.1 Entitlements and feature flags
- `entitlementAtom`: a jotai atom holding the entitlements or `null`.
  `features/user/user-provider.tsx` (core) loads them with `useEntitlements()`
  and writes them into the atom.
- `useEntitlements()`: a react-query query for `/workspace/entitlements`.
  The core `UserProvider` calls it unconditionally, and that provider wraps
  the signed-in part of the app.
- `useHasFeature(feature)` returns `true` only if the current entitlements
  list the feature.
- `Feature` mirrors the server constants exactly (section 4).
- Export an `Entitlements` type and a `Tier` type that includes
  `docmost-teams`, and point the kept `tier.utils.ts` at them.

### 6.2 Edition label
`useUpgradeLabel()` returns the short tooltip core shows next to features
the server does not grant. In this edition it should say plainly that the
feature isn't included in docmost-teams. Do not suggest buying or activating
a license.

### 6.3 Login page SSO block (`@/ee/components/sso-login.tsx` default export)
Used by core `features/auth/components/login-form.tsx` and
`invite-sign-up-form.tsx`. Data comes from the core
`useWorkspacePublicDataQuery()`.

- Show one full-width button per provider whose `type` is `oidc`. Hide other
  types: SAML, LDAP and Google rows can be left over from an upstream
  enterprise install, and this server can't serve them.
  - Label each button with the provider's name.
  - Pick the icon by `preset`. Use Google, Microsoft and Facebook brand icons
    from `@tabler/icons-react` where available, and a neutral icon for
    Keycloak and generic.
- Clicking a button navigates (full page) to the provider's login URL from
  section 5.4. Include `redirect=<path>` when the core `getRedirectParam()`
  (`@/lib/app-route`) returns one.
- When the password form is also shown (`enforceSso` is false), separate the
  buttons from it visually. With no usable providers, render no buttons.
- Errors: when the URL has `sso_error`, show an error alert above the
  buttons, even when there are no providers.
  - The message comes from a fixed map keyed by the server's codes (section
    5.4), so a crafted link can't put text on the page.
  - Look codes up as own properties only (`Object.hasOwn` or a `Map`).
    `toString`, `constructor`, `__proto__` and similar must fall back to the
    generic message.
  - Write your own wording. For `signup_disabled`, don't tell the user to
    request an invitation: SSO can't redeem invitations yet, and the user may
    already have one. Say there's no account for that email and to contact a
    workspace admin.
- Automatic redirect: when `enforceSso` is true, there is exactly one
  provider, and the user isn't signed in (core `useCurrentUser`), redirect to
  that provider without a click. Never do this when any of these holds:
  - the URL has `logout` or `sso_error`;
  - the current path is an invitation page (`/invites/...`);
  - an automatic redirect already happened in this tab in the last 5
    minutes. Keep the timestamp in `sessionStorage`, and tolerate storage
    being unavailable.

### 6.4 Settings → Security & SSO page (`@/teams/security/pages/security.tsx`, default export)
- Admins and owners only. Others get redirected the way core
  `pages/settings/workspace/workspace-settings.tsx` does it.
- Sections, each shown only if the server grants what it needs:
  1. **Single sign-on providers** (section 6.5). Needs `sso:custom`.
  2. **Enforce SSO**: a switch bound to `workspace.enforceSso`.
     - Explain that password login, password reset and password invitation
       sign-up stop working for everyone, so a working provider must exist
       first.
     - Disallow switching it on while no provider is enabled. Show the
       server's error if it still refuses.
  3. **Allowed email domains**: edit the list and save it. Show the saved,
     normalized list from the response. Explain what the list restricts
     (section 5.2).
  4. **Public sharing**: a workspace-wide switch to disable public sharing.
     Needs `security:settings`. Changing it has visible consequences, so
     consider confirming first.
  5. **Trash retention**: how many days pages stay in trash before permanent
     deletion. Needs `security:settings`. Integer ≥ 1, default 30.
- Leave out MFA, SCIM, API restrictions and templates. This server doesn't
  support them.
- Use `t()` for every string and show server errors to the user.

### 6.5 SSO provider management
- **List**:
  - Use query key `["sso-providers"]` with `getSsoProviders()`. Core
    settings navigation prefetches that key on hover.
  - For each provider show the preset icon, name, preset label, enabled
    state, and whether signup and group sync are on.
  - Actions: edit and delete. Delete needs confirmation.
- **Lockout guard**: when `workspace.enforceSso` is on, block deleting or
  disabling the last enabled provider, and tell the admin to turn off
  Enforce SSO first. The server enforces the same rule.
- **Add**:
  - Pick a preset: Generic OIDC, Keycloak, Google, Microsoft Entra ID or
    Facebook.
  - This opens the editor for a draft with a fresh UUID v7 id (`v7` from
    `uuid`, already a dependency). Nothing is stored until Save.
  - Save sends one `/sso/create` request with the id, `type: 'oidc'`, the
    preset, the name, and the fields the admin changed. The server applies
    defaults for the rest.
  - Cancelling discards the draft.
- **Edit**:
  - Open the editor with stored values. The client secret field starts empty
    and shows whether a secret is stored.
  - Save sends `/sso/update` with `providerId` and only the changed fields.
  - Leaving the secret blank keeps it.
- **Unsaved changes**: closing the editor with unsaved edits asks for
  confirmation. Closing means Cancel, the close button, Esc or a click
  outside. This applies to drafts and saved providers.
- **Test**:
  - A button sends the current form values to `/sso/test`, with
    `providerId` for saved providers and `preset` for drafts.
  - Show the verdict, the message, the discovered endpoints, the
    credentials result and any warnings, all rendered as plain text.
- **Callback URL**: show `<APP_URL>/api/sso/oidc/<id>/callback` with a copy
  button, for drafts too. Use the core `getAppUrl()`.
- **Fields**: validate the way the server DTO does.
  - Every preset: display name (required, ≤ 100), client ID, client secret,
    Enabled, Allow signup.
  - Generic: issuer URL (http or https).
  - Keycloak: server URL and realm. The realm can't contain `/ ? # \`. Show
    the derived issuer read-only.
  - Microsoft: directory (tenant) ID, GUID only. Explain that only that
    tenant's accounts can sign in.
  - Google: optional Workspace domain. When set, only accounts managed by
    that domain can sign in.
  - Facebook: optional Graph API version (`vNN.N`). No token auth method, no
    groups.
  - Advanced, for every OIDC preset:
    - scopes, space-separated (the server always adds `openid`);
    - login prompt: none / login / select_account / consent, where "none"
      means sending no prompt (server value `''`);
    - token endpoint auth method: auto / client_secret_post /
      client_secret_basic;
    - require verified email.
  - Group sync, only for presets that support groups (generic, Keycloak,
    Microsoft):
    - an on/off switch;
    - the group claim path (dot paths allowed);
    - filter patterns (`*` wildcard, empty means all);
    - owner groups;
    - admin groups.
- **Defaults**: a draft shows the same defaults the server would apply
  (`SSO_PRESET_DEFINITIONS`), so what the admin sees is what gets stored.
  Keep the client copy of these defaults in one place, and add a test that
  pins them.
- **Warnings** (in-form callouts):
  - Require verified email is off: sign-in will attach to any existing
    account with the same email, so use this only with providers that control
    their addresses.
  - Allow signup is on, with Google and no Workspace domain, or with
    Facebook: anyone with an account there can create a Docmost account,
    unless the workspace's allowed email domains restrict it.
  - Group sync is on and owner or admin groups are set: members of those
    identity-provider groups get that workspace role at every sign-in, and
    owners administer every non-private space.
  - The issuer uses http: only for local development.
  - Microsoft group sync: Entra leaves groups out for users in more than 200
    groups, and their group and role sync is skipped.
- **Errors**: show the server message, for example the list of missing
  fields when enabling.

### 6.6 Space-level public sharing switch (`@/ee/security/components/space-public-sharing-toggle.tsx`)
Rendered by core `features/space/components/space-security-settings.tsx`
with `{ space }`, inside the space settings for space admins.

- A switch to disable public sharing in this space (section 5.3).
- If workspace-wide sharing is disabled, show it as on and disabled, with
  the reason.
- If the space is private (`space.isPersonal`), show it as on and disabled:
  private spaces can't be shared.
- A space converted from private back to ordinary keeps
  `sharing.disabled = true`. The switch must let a space admin turn sharing
  back on.

### 6.7 Private spaces
- `private-spaces-setting.tsx` (default export, rendered in
  Settings → General): a switch bound to
  `workspace.settings.spaces.allowPersonal` that saves `allowPersonalSpaces`.
  Explain that only the creator can see a private space, and that admins and
  owners can't open it.
- `create-private-space-modal.tsx`:
  - Default export: a modal with props `{ opened, onClose }`.
  - Named export: `PrivateSpaceForm({ onCreated? })`.
  - The form has a name field, trimmed, 2–100 characters, submitted to
    `/spaces/private/create`.
  - On success: invalidate the `["spaces"]` query prefix (this also refreshes
    `["spaces","personal","mine"]`), call `onCreated`, notify, and navigate to
    the new space (core `getSpaceUrl(slug)`).
  - Show server errors, for example 403 when the setting is off.
- `queries/private-space-query.ts`:
  - `useCreatePersonalSpaceMutation()`.
  - `useMyPersonalSpacesQuery()`: key `["spaces","personal","mine"]`,
    `/spaces/private/mine`, stale after about a minute.
  - `usePinnedPersonalSpaceIds()`: a `Set` of those ids.
- `services/private-space-service.ts`:
  - `createPersonalSpace({ name })`, `convertPersonalSpace({ spaceId, isPersonal })`
    and `getMyPersonalSpaces()`.
  - The `IPersonalSpaceSummary` type `{ id, name, slug, logo }`.
- Keep the pinned personal spaces in the global sidebar exactly as they
  behave now (`pinned-personal-spaces.tsx`, a kept file):
  - a "Personal space(s)" section above Favorite spaces listing the user's
    private spaces, with a lock icon and no unpin control;
  - a "Create personal space" entry when they have none and the setting is
    on;
  - pinned spaces are left out of the favorites list.
- Fix in the kept file `personal-space-conversion.tsx`: after converting,
  don't write the response into the space cache, because it has no
  `membership` and the UI turns read-only. Invalidate `["space", id]`,
  `["space", slug]`, `["spaces"]` and `["spaceMembers", id]` instead.

### 6.8 Page Share button
`PageShareModal` renders core `ShareModal` (see the table in section 4).
Core `ShareModal` already respects workspace-level and space-level sharing
settings. Check that private spaces show sharing as unavailable.

### 6.9 Edition page (`/settings/license`, self-hosted only)
Admins only. Show:
- the edition name (docmost-teams);
- the version (`APP_VERSION`);
- what this edition adds (OIDC single sign-on with presets, enforced SSO,
  group and role sync, private spaces, workspace security settings);
- a sentence that Docmost Enterprise features aren't part of this edition;
- a link to the project's README.

No license key entry and no upgrade prompts.

### 6.10 Settings sidebar (core `components/settings/settings-sidebar.tsx`)
Keep the edit minimal:
- Hide entries whose `feature` the server doesn't grant, instead of showing
  them disabled with a tooltip.
- Hide "AI settings": this server has no AI.
- Keep "License & Edition", which now leads to the edition page.

### 6.11 Unsupported features
AI, AI chat, API keys, audit logs, MFA, SCIM, templates, page verification,
page permissions, comment resolution, PDF export, bases, billing and cloud
pages are not part of this edition, and their server code doesn't exist.

- Their compat modules are stubs (section 4).
- Their routes render one shared page saying the feature isn't available in
  docmost-teams, with a link home.
- No stub may make network requests.

## 7. Behaviour to preserve from the previous fork client

- Provider drafts are saved in one `/sso/create` call with a
  client-generated UUID v7 id.
- The unsaved-changes confirmation applies to new and existing providers.
- `/sso/test` without `providerId` tests a draft by `preset`.
- `?sso_error=<code>` maps to fixed messages, and while it is present the
  SSO auto-redirect is skipped.
- Login buttons use the provider's `preset` icon.
- Pinned personal spaces work as described in section 6.7.

## 8. Conventions

- Stack: React with Mantine, `@tabler/icons-react`, `@tanstack/react-query`
  v5, jotai, react-i18next and zod. Follow the patterns in the surrounding
  core code: services in `services/`, query hooks in `queries/`, components in
  `components/`.
- Every user-visible string goes through `t()`.
- Add no new dependencies.
- Keep core file edits minimal and list each core file you touched in your
  report.
- Accessibility: icon-only buttons get an `aria-label`, and switches get
  labels.
- Tests (vitest and Testing Library are available) should cover at least:
  - the SSO error mapping, including prototype keys;
  - the auto-redirect guard;
  - the provider payloads (create sends the id and preset; update sends
    changed fields only; a blank secret is omitted);
  - the preset defaults matching the server;
  - `useHasFeature`;
  - the lockout guard.

## 9. Verification and deliverables

- Install with `pnpm install --frozen-lockfile` if `node_modules` is missing.
  Build the workspace packages the client type-check needs (see
  `DEVELOPER.md`).
- All of these must pass:
  - `pnpm --filter ./apps/client exec tsc --noEmit`
  - `pnpm --filter ./apps/client test`
  - `pnpm --filter ./apps/client build`
- `apps/client/src/ee` must not exist. No source file may import a path
  inside it, except through the `@/ee/` alias.
- CI: in `.github/workflows/ci.yml`, add an early step that fails when
  `apps/client/src/ee` exists.
- Docs:
  - README: the features list, and a License section saying the fork ships no
    Enterprise-licensed client code.
  - `DEVELOPER.md`: describe the compat layer.
  - `docs/upstream-sync.md`: after replaying fork commits onto a new upstream
    release, delete `apps/client/src/ee` again (resolve modify/delete
    conflicts by deleting), then add compat modules for any new `@/ee/...`
    imports the build reports.
- Commit on the current branch with conventional commit messages.
- Final report:
  - files added and changed;
  - core files touched;
  - decisions you made where this document was silent;
  - anything left unimplemented;
  - a summary of the type-check, test and build results.

## 10. Removed on this branch before implementation

- `apps/client/src/ee/` (all of it).
- Fork files derived from it:
  - `apps/client/src/teams/security/` (all of it), including the SSO admin
    UI, login error and icon components and their tests;
  - `apps/client/src/teams/private-space/components/create-private-space-modal.tsx`;
  - `apps/client/src/teams/private-space/components/private-spaces-setting.tsx`;
  - `apps/client/src/teams/private-space/queries/private-space-query.ts`;
  - `apps/client/src/teams/private-space/services/private-space-service.ts`.

Kept fork files you may read and edit: `teams/entitlement/tier.utils.ts`, and
in `teams/private-space/components/`: `personal-pages.tsx`,
`personal-space-conversion.tsx`, `pinned-personal-spaces.tsx`,
`private-space-indicator.tsx` and `space-creation-action.tsx`.
