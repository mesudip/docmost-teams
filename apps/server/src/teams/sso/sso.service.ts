import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  AuthProvider,
  InsertableAuthAccount,
  InsertableAuthProvider,
  UpdatableAuthProvider,
  User,
  Workspace,
} from '@docmost/db/types/entity.types';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignupService } from '../../core/auth/services/signup.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { hashPassword, nanoIdGen } from '../../common/helpers';
import { validateAllowedEmail } from '../../core/auth/auth.util';
import { UserRole } from '../../common/helpers/types/permission';
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  AuthorizationResponseError,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientAuth,
  ClientSecretBasic,
  ClientSecretPost,
  Configuration,
  discovery,
  fetchUserInfo,
  genericGrantRequest,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  ResponseBodyError,
} from 'openid-client';
import {
  buildDefaultSettings,
  EffectiveSsoSettings,
  FACEBOOK_GRAPH_VERSION,
  getEffectiveSettings,
  getMissingConfig,
  getPresetDefinition,
  getProviderPreset,
  isSsoPreset,
  normalizeScopes,
  resolveIssuer,
  SSO_PROVIDER_TYPE,
  SsoPreset,
  SsoProviderSettings,
  SsoTokenAuthMethod,
} from './sso-presets';
import {
  filterGroupNames,
  hasDistributedClaim,
  includesGroup,
  isEmailAddress,
  normalizeGroupNames,
  readBooleanClaim,
  readGroupClaim,
  readStringClaim,
} from './sso-claims';
import { SsoLoginError } from './sso-login-error';
import { SsoSyncService } from './sso-sync.service';

const OIDC_STATE_TTL_MS = 10 * 60 * 1000;
const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;
const CONFIG_CACHE_MAX_ENTRIES = 100;
const HTTP_TIMEOUT_SECONDS = 10;
const MAX_SYNCED_GROUPS = 1000;
const MAX_SETTINGS_LIST_ITEMS = 100;

export type SsoCookieState = {
  codeVerifier: string;
  expiresAt: number;
  nonce: string;
  origin: string;
  providerId: string;
  redirectPath: string;
  state: string;
};

type ProviderMutationPayload = {
  id?: string;
  providerId?: string;
  type?: string;
  preset?: string;
  name?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  allowSignup?: boolean;
  isEnabled?: boolean;
  groupSync?: boolean;
  settings?: SsoProviderSettings;
};

type SafeAuthProvider = Pick<
  AuthProvider,
  | 'id'
  | 'name'
  | 'type'
  | 'oidcIssuer'
  | 'oidcClientId'
  | 'allowSignup'
  | 'isEnabled'
  | 'groupSync'
  | 'creatorId'
  | 'workspaceId'
  | 'settings'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
> & {
  hasOidcClientSecret: boolean;
};

type SsoProfile = {
  subject: string;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  // null when the provider sent no group claim at all
  groups: string[] | null;
  // the provider moved the group claim out of the token (Entra overage)
  groupsUnavailable: boolean;
};

export type SsoTestResult = {
  ok: boolean;
  message: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string | null;
  tokenAuthMethod?: string;
  credentials: 'valid' | 'invalid' | 'unknown';
  warnings: string[];
};

const SETTINGS_STRING_KEYS = [
  'keycloakUrl',
  'keycloakRealm',
  'microsoftTenantId',
  'googleHostedDomain',
  'facebookGraphVersion',
  'scopes',
  'groupClaimName',
] as const;

const SETTINGS_LIST_KEYS = ['groupFilter', 'ownerGroups', 'adminGroups'] as const;

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly configCache = new Map<
    string,
    { config: Configuration; expiresAt: number }
  >();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly signupService: SignupService,
    private readonly userRepo: UserRepo,
    private readonly environmentService: EnvironmentService,
    private readonly ssoSyncService: SsoSyncService,
    private readonly userSessionRepo: UserSessionRepo,
  ) {}

  async listProviders(workspaceId: string) {
    const items = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();

    return {
      items: items.map((provider) => this.sanitizeProvider(provider)),
      meta: {
        limit: items.length,
        hasNextPage: false,
        hasPrevPage: false,
        nextCursor: null,
        prevCursor: null,
      },
    };
  }

  async getProvider(workspaceId: string, providerId: string) {
    const provider = await this.getProviderOrThrow(workspaceId, providerId);
    return this.sanitizeProvider(provider);
  }

  /**
   * Creates a provider from the complete form in one insert, so cancelling
   * the form never leaves a half-configured provider behind.
   */
  async createProvider(
    workspaceId: string,
    userId: string,
    payload: ProviderMutationPayload,
  ) {
    if (payload.type !== SSO_PROVIDER_TYPE) {
      throw new BadRequestException(
        'This fork only supports creating OIDC-based providers.',
      );
    }

    const draft = this.buildNewProvider(workspaceId, userId, payload.preset);
    const values: InsertableAuthProvider = {
      ...draft,
      ...this.buildProviderPatch(draft as AuthProvider, payload),
    };
    if (!values.name?.trim()) {
      values.name = draft.name;
    }
    if (payload.id) {
      values.id = payload.id;
    }
    this.assertCompleteIfEnabled(values as AuthProvider);

    try {
      const provider = await this.db
        .insertInto('authProviders')
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.sanitizeProvider(provider);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'An SSO provider with this ID already exists.',
        );
      }
      throw err;
    }
  }

  async updateProvider(workspaceId: string, payload: ProviderMutationPayload) {
    const providerId = this.resolveProviderId(payload);

    return this.db.transaction().execute(async (trx) => {
      const enforceSso = await this.lockWorkspaceSsoState(trx, workspaceId);
      const provider = await this.getProviderOrThrow(
        workspaceId,
        providerId,
        trx,
      );
      const patch = this.buildProviderPatch(provider, payload);
      if (this.isSecretRedirected(provider, patch)) {
        throw new BadRequestException(
          'Re-enter the client secret when you change the issuer.',
        );
      }
      this.assertCompleteIfEnabled({ ...provider, ...patch } as AuthProvider);
      if (enforceSso && provider.isEnabled && patch.isEnabled === false) {
        await this.assertNotLastEnforcedProvider(trx, workspaceId, providerId);
      }

      const updatedProvider = await trx
        .updateTable('authProviders')
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where('id', '=', providerId)
        .where('workspaceId', '=', workspaceId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return this.sanitizeProvider(updatedProvider);
    });
  }

  /**
   * Checks a provider configuration without saving it. Unsaved form values
   * in `payload` override the stored ones, including the stored secret.
   * Without a provider id, an unsaved provider of `payload.preset` is tested.
   */
  async testProvider(
    workspaceId: string,
    payload: ProviderMutationPayload,
  ): Promise<SsoTestResult> {
    const providerId = payload.providerId || payload.id;
    const provider = providerId
      ? await this.getProviderOrThrow(workspaceId, providerId)
      : ({
          ...this.buildNewProvider(workspaceId, null, payload.preset),
          id: 'draft',
        } as AuthProvider);
    const patch = this.buildProviderPatch(provider, payload);
    const candidate = { ...provider, ...patch } as AuthProvider;
    const settings = getEffectiveSettings(candidate);
    const warnings: string[] = [];

    if (this.isSecretRedirected(provider, patch)) {
      return {
        ok: false,
        message:
          'Re-enter the client secret to test a different issuer. The saved secret is only sent to the issuer it was saved for.',
        credentials: 'unknown',
        warnings,
      };
    }

    const missing = getMissingConfig(candidate);
    if (missing.length > 0) {
      return {
        ok: false,
        message: `Set the ${missing.join(', ')} first.`,
        credentials: 'unknown',
        warnings,
      };
    }

    if (settings.preset === 'facebook') {
      return this.testFacebookCredentials(candidate, settings);
    }

    if (candidate.oidcIssuer?.startsWith('http:')) {
      warnings.push(
        'The issuer uses http. Tokens are exchanged without TLS; use https outside local development.',
      );
    }

    const callbackUrl = this.buildCallbackUrl(
      this.environmentService.getAppUrl(),
      provider.id,
    );
    let config: Configuration;
    try {
      config = await this.createClientConfig(candidate, callbackUrl);
    } catch (err) {
      return {
        ok: false,
        message: `Could not load the OpenID configuration from ${candidate.oidcIssuer}: ${this.describeError(err)}`,
        credentials: 'unknown',
        warnings,
      };
    }

    const metadata = config.serverMetadata();
    const credentials = await this.checkClientCredentials(config, callbackUrl);

    return {
      ok: credentials !== 'invalid',
      message:
        credentials === 'invalid'
          ? 'The provider rejected the client ID or client secret.'
          : 'The provider configuration was loaded successfully.',
      issuer: metadata.issuer,
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      userinfoEndpoint: metadata.userinfo_endpoint ?? null,
      tokenAuthMethod: this.resolveTokenAuthMethod(
        metadata.token_endpoint_auth_methods_supported,
        settings.tokenAuthMethod,
      ),
      credentials,
      warnings,
    };
  }

  async deleteProvider(workspaceId: string, providerId: string) {
    await this.db.transaction().execute(async (trx) => {
      const enforceSso = await this.lockWorkspaceSsoState(trx, workspaceId);
      const provider = await this.getProviderOrThrow(
        workspaceId,
        providerId,
        trx,
      );
      if (enforceSso && provider.isEnabled) {
        await this.assertNotLastEnforcedProvider(trx, workspaceId, providerId);
      }

      await trx
        .deleteFrom('authProviders')
        .where('id', '=', providerId)
        .where('workspaceId', '=', workspaceId)
        .execute();
    });
  }

  /**
   * Locks the workspace row so concurrent provider changes see each other's
   * effect on enforced SSO, and returns whether SSO is enforced.
   */
  private async lockWorkspaceSsoState(
    trx: KyselyTransaction,
    workspaceId: string,
  ): Promise<boolean> {
    const workspace = await trx
      .selectFrom('workspaces')
      .select('enforceSso')
      .where('id', '=', workspaceId)
      .forUpdate()
      .executeTakeFirst();

    return Boolean(workspace?.enforceSso);
  }

  // Password login is refused while SSO is enforced, so turning off the last
  // provider that can sign people in would lock everyone out.
  private async assertNotLastEnforcedProvider(
    trx: KyselyTransaction,
    workspaceId: string,
    providerId: string,
  ) {
    const others = await trx
      .selectFrom('authProviders')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('type', '=', SSO_PROVIDER_TYPE)
      .where('isEnabled', '=', true)
      .where('deletedAt', 'is', null)
      .where('id', '!=', providerId)
      .limit(1)
      .execute();

    if (others.length === 0) {
      throw new BadRequestException(
        'Turn off Enforce SSO before you disable or delete the last enabled SSO provider.',
      );
    }
  }

  // True when the patch points the provider at a different issuer while the
  // stored secret would be reused, which would send that secret to a server
  // it was never entered for.
  private isSecretRedirected(
    provider: AuthProvider,
    patch: UpdatableAuthProvider,
  ): boolean {
    return (
      Boolean(provider.oidcClientSecret) &&
      !patch.oidcClientSecret &&
      typeof patch.oidcIssuer === 'string' &&
      patch.oidcIssuer !== provider.oidcIssuer
    );
  }

  async buildLoginUrl(opts: {
    providerId: string;
    workspaceId: string;
    origin: string;
    redirectPath: string;
  }): Promise<{ state: SsoCookieState; url: string }> {
    const provider = await this.getUsableProvider(
      opts.workspaceId,
      opts.providerId,
    );
    const settings = getEffectiveSettings(provider);
    const { protocol } = getPresetDefinition(settings.preset);

    const callbackUrl = this.buildCallbackUrl(opts.origin, provider.id);
    const config = await this.loadClientConfig(provider, callbackUrl);
    const state = randomState();
    const nonce = protocol === 'oidc' ? randomNonce() : '';
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    const parameters: Record<string, string> = {
      scope: normalizeScopes(settings.scopes, protocol),
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: callbackUrl,
    };
    if (nonce) {
      parameters.nonce = nonce;
    }
    if (settings.prompt) {
      parameters.prompt = settings.prompt;
    }
    if (settings.preset === 'google' && settings.googleHostedDomain) {
      // Only a hint for Google's account chooser; the hd claim is enforced
      // after login.
      parameters.hd = settings.googleHostedDomain;
    }

    const url = buildAuthorizationUrl(config, parameters);

    return {
      url: url.toString(),
      state: {
        state,
        codeVerifier,
        expiresAt: Date.now() + OIDC_STATE_TTL_MS,
        nonce,
        providerId: provider.id,
        origin: opts.origin,
        redirectPath: opts.redirectPath,
      },
    };
  }

  async finishLogin(opts: {
    cookieState: SsoCookieState;
    currentUrl: URL;
    workspaceId: string;
  }): Promise<User> {
    if (opts.cookieState.expiresAt < Date.now()) {
      throw new SsoLoginError('state_invalid', 'Expired SSO login state.');
    }

    const provider = await this.getUsableProvider(
      opts.workspaceId,
      opts.cookieState.providerId,
    );
    const settings = getEffectiveSettings(provider);
    const definition = getPresetDefinition(settings.preset);
    const config = await this.loadClientConfig(
      provider,
      this.buildCallbackUrl(opts.cookieState.origin, provider.id),
    );

    const profile =
      definition.protocol === 'oauth2'
        ? await this.fetchFacebookProfile(config, provider, settings, opts)
        : await this.fetchOidcProfile(config, provider, settings, opts);

    if (!isEmailAddress(profile.email)) {
      throw new SsoLoginError(
        'email_missing',
        'The identity provider did not return an email address.',
      );
    }

    if (settings.requireVerifiedEmail && profile.emailVerified !== true) {
      throw new SsoLoginError(
        'email_unverified',
        'The identity provider did not confirm that the email address is verified.',
      );
    }

    const workspace = (await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', opts.workspaceId)
      .executeTakeFirstOrThrow()) as Workspace;

    try {
      validateAllowedEmail(profile.email, workspace);
    } catch (err) {
      throw new SsoLoginError('domain_not_allowed', this.describeError(err));
    }

    let user = await this.findOrCreateUser({
      workspace,
      provider,
      providerUserId: profile.subject,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0],
    });

    if (provider.groupSync && definition.supportsGroups) {
      user = await this.applyGroupSync({
        user,
        provider,
        settings,
        profile,
        workspace,
      });
    }

    await this.userRepo.updateLastLogin(user.id, user.workspaceId);

    return {
      ...user,
      workspaceId: opts.workspaceId,
    };
  }

  buildOrigin(host?: string, forwardedProto?: string): string {
    const resolvedHost = host?.trim();
    if (!resolvedHost) {
      return this.environmentService.getAppUrl();
    }

    const proto =
      forwardedProto?.split(',')[0]?.trim() ||
      (resolvedHost.startsWith('localhost') ||
      resolvedHost.startsWith('127.0.0.1')
        ? 'http'
        : this.environmentService.isHttps()
          ? 'https'
          : 'http');

    let candidateOrigin: string;
    try {
      candidateOrigin = new URL(`${proto}://${resolvedHost}`).origin;
    } catch {
      throw new BadRequestException('Invalid OIDC redirect origin.');
    }

    if (!this.getAllowedRedirectOrigins().has(candidateOrigin)) {
      throw new BadRequestException('OIDC redirect origin is not allowed.');
    }

    return candidateOrigin;
  }

  sanitizeRedirectPath(input?: string | null): string {
    if (!input || typeof input !== 'string') return '/home';
    if (
      input.length > 2048 ||
      !input.startsWith('/') ||
      input.startsWith('//') ||
      /\s|\\/.test(input) ||
      input.toLowerCase().includes('://') ||
      /^\/[a-z][a-z0-9+\-.]*:/i.test(input)
    ) {
      return '/home';
    }

    return input;
  }

  encodeStateCookie(state: SsoCookieState): string {
    const payload = Buffer.from(JSON.stringify(state), 'utf8').toString(
      'base64url',
    );
    return `${payload}.${this.signStatePayload(payload)}`;
  }

  decodeStateCookie(raw?: string): SsoCookieState | null {
    if (!raw) return null;

    try {
      const [payload, signature] = raw.split('.');
      if (!payload || !signature) return null;

      const expectedSignature = this.signStatePayload(payload);
      const signatureBuffer = Buffer.from(signature, 'base64url');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        return null;
      }

      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as SsoCookieState;

      if (
        !parsed ||
        typeof parsed.codeVerifier !== 'string' ||
        typeof parsed.expiresAt !== 'number' ||
        typeof parsed.nonce !== 'string' ||
        typeof parsed.origin !== 'string' ||
        typeof parsed.providerId !== 'string' ||
        typeof parsed.redirectPath !== 'string' ||
        typeof parsed.state !== 'string' ||
        parsed.expiresAt < Date.now() ||
        !this.getAllowedRedirectOrigins().has(parsed.origin)
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private signStatePayload(payload: string): string {
    return createHmac('sha256', this.environmentService.getAppSecret())
      .update(payload)
      .digest('base64url');
  }

  private getAllowedRedirectOrigins(): Set<string> {
    const configuredOrigins = (process.env.OIDC_ALLOWED_REDIRECT_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const allowed = new Set<string>([this.environmentService.getAppUrl()]);
    for (const value of configuredOrigins) {
      try {
        allowed.add(new URL(value).origin);
      } catch {
        throw new BadRequestException(
          'OIDC_ALLOWED_REDIRECT_ORIGINS contains an invalid URL.',
        );
      }
    }

    return allowed;
  }

  private async fetchOidcProfile(
    config: Configuration,
    provider: AuthProvider,
    settings: EffectiveSsoSettings,
    opts: { cookieState: SsoCookieState; currentUrl: URL },
  ): Promise<SsoProfile> {
    const tokens = await this.exchangeCode(config, opts.currentUrl, {
      expectedState: opts.cookieState.state,
      expectedNonce: opts.cookieState.nonce || undefined,
      pkceCodeVerifier: opts.cookieState.codeVerifier,
      idTokenExpected: true,
    });

    const idClaims = (tokens.claims() ?? {}) as Record<string, unknown>;
    const subject = readStringClaim(idClaims, 'sub');
    if (!subject) {
      throw new SsoLoginError(
        'idp_error',
        'The ID token is missing the subject claim.',
      );
    }

    const groupClaim = settings.groupClaimName;
    const wantsGroups =
      provider.groupSync && getPresetDefinition(settings.preset).supportsGroups;
    const idGroups = wantsGroups ? readGroupClaim(idClaims, groupClaim) : null;

    let userInfo: Record<string, unknown> | null = null;
    const needsUserInfo =
      !readStringClaim(idClaims, 'email') ||
      !readStringClaim(idClaims, 'name') ||
      (wantsGroups && idGroups === null) ||
      (settings.requireVerifiedEmail &&
        readBooleanClaim(idClaims, 'email_verified') === null);

    if (needsUserInfo && config.serverMetadata().userinfo_endpoint) {
      try {
        userInfo = (await fetchUserInfo(
          config,
          tokens.access_token,
          subject,
        )) as Record<string, unknown>;
      } catch (err) {
        this.logger.warn(
          `UserInfo request failed for SSO provider ${provider.id}: ${this.describeError(err)}`,
        );
      }
    }

    // Signed ID token claims take precedence over UserInfo.
    const str = (key: string) =>
      readStringClaim(idClaims, key) ?? readStringClaim(userInfo, key);
    const bool = (key: string) =>
      readBooleanClaim(idClaims, key) ?? readBooleanClaim(userInfo, key);

    let email = str('email');
    let emailVerified = bool('email_verified');

    if (settings.preset === 'microsoft') {
      if (!isEmailAddress(email)) {
        email =
          [str('preferred_username'), str('upn')].find(isEmailAddress) ?? null;
      }
      // Optional "email domain owner verified" claim.
      emailVerified = emailVerified ?? bool('xms_edov');
    }

    if (settings.preset === 'google' && settings.googleHostedDomain) {
      const hostedDomain = readStringClaim(idClaims, 'hd');
      if (
        hostedDomain?.toLowerCase() !==
        settings.googleHostedDomain.toLowerCase()
      ) {
        throw new SsoLoginError(
          'domain_not_allowed',
          `Google account is not part of ${settings.googleHostedDomain}.`,
        );
      }
    }

    const groups = idGroups ?? readGroupClaim(userInfo, groupClaim);
    const groupsUnavailable =
      wantsGroups &&
      groups === null &&
      (hasDistributedClaim(idClaims, groupClaim) ||
        hasDistributedClaim(userInfo, groupClaim));

    const fullName = [str('given_name'), str('family_name')]
      .filter(Boolean)
      .join(' ');

    return {
      subject,
      email: email?.toLowerCase() ?? null,
      emailVerified,
      name: str('name') || fullName || str('preferred_username'),
      groups,
      groupsUnavailable,
    };
  }

  private async fetchFacebookProfile(
    config: Configuration,
    provider: AuthProvider,
    settings: EffectiveSsoSettings,
    opts: { cookieState: SsoCookieState; currentUrl: URL },
  ): Promise<SsoProfile> {
    const tokens = await this.exchangeCode(config, opts.currentUrl, {
      expectedState: opts.cookieState.state,
      pkceCodeVerifier: opts.cookieState.codeVerifier,
      idTokenExpected: false,
    });

    const url = new URL(
      `https://graph.facebook.com/${settings.facebookGraphVersion}/me`,
    );
    url.searchParams.set('fields', 'id,name,email');
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', provider.oidcClientSecret!)
        .update(tokens.access_token)
        .digest('hex'),
    );

    let body: Record<string, unknown>;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${tokens.access_token}`,
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_SECONDS * 1000),
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      body = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      throw new SsoLoginError(
        'idp_error',
        `Facebook profile request failed: ${this.describeError(err)}`,
      );
    }

    const subject = readStringClaim(body, 'id');
    if (!subject) {
      throw new SsoLoginError(
        'idp_error',
        'Facebook did not return a user ID.',
      );
    }

    // Facebook omits the email field unless the user has a confirmed
    // primary address, but it never sends an explicit verification flag.
    return {
      subject,
      email: readStringClaim(body, 'email')?.toLowerCase() ?? null,
      emailVerified: null,
      name: readStringClaim(body, 'name'),
      groups: null,
      groupsUnavailable: false,
    };
  }

  private async exchangeCode(
    config: Configuration,
    currentUrl: URL,
    checks: Parameters<typeof authorizationCodeGrant>[2],
  ) {
    try {
      return await authorizationCodeGrant(config, currentUrl, checks);
    } catch (err) {
      throw new SsoLoginError(
        'idp_error',
        `Authorization code exchange failed: ${this.describeError(err)}`,
      );
    }
  }

  private async applyGroupSync(opts: {
    user: User;
    provider: AuthProvider;
    settings: EffectiveSsoSettings;
    profile: SsoProfile;
    workspace: Workspace;
  }): Promise<User> {
    const { user, provider, settings, profile, workspace } = opts;

    if (profile.groupsUnavailable) {
      this.logger.warn(
        `SSO provider ${provider.id} sent the "${settings.groupClaimName}" claim by reference (too many groups). Group and role sync were skipped for user ${user.id}.`,
      );
      return user;
    }

    const groups = normalizeGroupNames(profile.groups ?? []);
    const syncedGroups = filterGroupNames(groups, settings.groupFilter);

    if (syncedGroups.length > MAX_SYNCED_GROUPS) {
      this.logger.warn(
        `SSO provider ${provider.id} sent ${syncedGroups.length} groups for user ${user.id}; group and role sync were skipped. Use a group filter to narrow them.`,
      );
      return user;
    }

    // SCIM owns group membership while it is enabled.
    if (!workspace.isScimEnabled) {
      await this.ssoSyncService.syncGroupMemberships({
        userId: user.id,
        workspaceId: workspace.id,
        providerId: provider.id,
        creatorId: provider.creatorId ?? user.id,
        groupNames: syncedGroups,
      });
    }

    const mappedRole = includesGroup(groups, settings.ownerGroups)
      ? UserRole.OWNER
      : includesGroup(groups, settings.adminGroups)
        ? UserRole.ADMIN
        : null;

    const role = await this.ssoSyncService.syncRole({
      userId: user.id,
      workspaceId: workspace.id,
      providerId: provider.id,
      mappedRole,
    });

    return role ? { ...user, role } : user;
  }

  private async findOrCreateUser(opts: {
    workspace: Workspace;
    provider: AuthProvider;
    providerUserId: string;
    email: string;
    name: string;
  }): Promise<User> {
    const linkedUser = await this.db
      .selectFrom('authAccounts')
      .innerJoin('users', 'users.id', 'authAccounts.userId')
      .selectAll('users')
      .where('authAccounts.workspaceId', '=', opts.workspace.id)
      .where('authAccounts.authProviderId', '=', opts.provider.id)
      .where('authAccounts.providerUserId', '=', opts.providerUserId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .executeTakeFirst();

    if (linkedUser) {
      return linkedUser as User;
    }

    let user = await this.userRepo.findByEmail(opts.email, opts.workspace.id);

    if (user?.deletedAt || user?.deactivatedAt) {
      throw new SsoLoginError(
        'account_inactive',
        'This user account is not active.',
      );
    }

    if (!user) {
      if (!opts.provider.allowSignup) {
        throw new SsoLoginError(
          'signup_disabled',
          'This SSO provider does not allow automatic signup.',
        );
      }

      user = await this.signupService.signup(
        {
          name: opts.name,
          email: opts.email,
          password: `oidc-${nanoIdGen()}-${nanoIdGen()}`,
        },
        opts.workspace.id,
      );

      await this.userRepo.updateUser(
        {
          emailVerifiedAt: new Date(),
          hasGeneratedPassword: true,
        },
        user.id,
        opts.workspace.id,
      );
      user = await this.userRepo.findById(user.id, opts.workspace.id);
    } else if (!user.emailVerifiedAt) {
      // Docmost never saw this address proven: it was changed after the
      // account was created, so whoever set it may not be this
      // identity-provider user. The account becomes theirs: its sessions end
      // and its password is replaced before it is linked.
      await this.userRepo.updateUser(
        {
          emailVerifiedAt: new Date(),
          password: await hashPassword(`sso-${nanoIdGen()}-${nanoIdGen()}`),
          hasGeneratedPassword: true,
        },
        user.id,
        opts.workspace.id,
      );
      await this.userSessionRepo.revokeByUserId(user.id, opts.workspace.id);
      user = await this.userRepo.findById(user.id, opts.workspace.id);
    }

    const account: InsertableAuthAccount = {
      authProviderId: opts.provider.id,
      providerUserId: opts.providerUserId,
      userId: user.id,
      workspaceId: opts.workspace.id,
      deletedAt: null,
    };

    await this.db
      .insertInto('authAccounts')
      .values(account)
      .onConflict((oc) =>
        oc.columns(['userId', 'authProviderId']).doUpdateSet({
          providerUserId: opts.providerUserId,
          updatedAt: new Date(),
          deletedAt: null,
        }),
      )
      .execute();

    return user;
  }

  private async loadClientConfig(
    provider: AuthProvider,
    callbackUrl: string,
  ): Promise<Configuration> {
    const key = `${provider.id}:${new Date(provider.updatedAt).getTime()}:${callbackUrl}`;
    const cached = this.configCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    let config: Configuration;
    try {
      config = await this.createClientConfig(provider, callbackUrl);
    } catch (err) {
      throw new SsoLoginError(
        'provider_unavailable',
        `Could not load the configuration of SSO provider ${provider.id}: ${this.describeError(err)}`,
      );
    }

    if (this.configCache.size >= CONFIG_CACHE_MAX_ENTRIES) {
      const now = Date.now();
      for (const [cacheKey, entry] of this.configCache) {
        if (entry.expiresAt <= now) this.configCache.delete(cacheKey);
      }
      if (this.configCache.size >= CONFIG_CACHE_MAX_ENTRIES) {
        this.configCache.delete(this.configCache.keys().next().value);
      }
    }
    this.configCache.set(key, {
      config,
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    });

    return config;
  }

  private async createClientConfig(
    provider: AuthProvider,
    callbackUrl: string,
  ): Promise<Configuration> {
    const settings = getEffectiveSettings(provider);
    const clientId = provider.oidcClientId!;
    const clientSecret = provider.oidcClientSecret!;
    const clientMetadata = {
      client_secret: clientSecret,
      redirect_uris: [callbackUrl],
      response_types: ['code'],
    };

    if (settings.preset === 'facebook') {
      const version = settings.facebookGraphVersion || FACEBOOK_GRAPH_VERSION;
      const config = new Configuration(
        {
          issuer: 'https://www.facebook.com',
          authorization_endpoint: `https://www.facebook.com/${version}/dialog/oauth`,
          token_endpoint: `https://graph.facebook.com/${version}/oauth/access_token`,
        },
        clientId,
        clientMetadata,
        ClientSecretPost(clientSecret),
      );
      config.timeout = HTTP_TIMEOUT_SECONDS;
      return config;
    }

    const issuer = new URL(provider.oidcIssuer!);
    const insecure = issuer.protocol === 'http:';
    const discovered = await discovery(
      issuer,
      clientId,
      clientMetadata,
      undefined,
      {
        timeout: HTTP_TIMEOUT_SECONDS,
        ...(insecure ? { execute: [allowInsecureRequests] } : {}),
      },
    );

    const serverMetadata = discovered.serverMetadata();
    const config = new Configuration(
      serverMetadata,
      clientId,
      clientMetadata,
      this.buildClientAuth(
        this.resolveTokenAuthMethod(
          serverMetadata.token_endpoint_auth_methods_supported,
          settings.tokenAuthMethod,
        ),
        clientSecret,
      ),
    );
    config.timeout = HTTP_TIMEOUT_SECONDS;
    if (insecure) {
      allowInsecureRequests(config);
    }
    return config;
  }

  private resolveTokenAuthMethod(
    supported: string[] | undefined,
    configured: SsoTokenAuthMethod,
  ): Exclude<SsoTokenAuthMethod, 'auto'> {
    if (configured !== 'auto') return configured;
    // RFC 8414: an omitted list means client_secret_basic.
    if (!supported?.length) return 'client_secret_basic';
    if (supported.includes('client_secret_post')) return 'client_secret_post';
    if (supported.includes('client_secret_basic')) return 'client_secret_basic';
    return 'client_secret_post';
  }

  private buildClientAuth(
    method: Exclude<SsoTokenAuthMethod, 'auto'>,
    clientSecret: string,
  ): ClientAuth {
    return method === 'client_secret_basic'
      ? ClientSecretBasic(clientSecret)
      : ClientSecretPost(clientSecret);
  }

  // Redeems a code that cannot exist. The token endpoint authenticates the
  // client before it looks at the code, so `invalid_grant` means the client
  // credentials were accepted, and `invalid_client` or a 401 means they were
  // not (Keycloak answers bad credentials with 401 unauthorized_client).
  private async checkClientCredentials(
    config: Configuration,
    callbackUrl: string,
  ): Promise<SsoTestResult['credentials']> {
    try {
      await genericGrantRequest(config, 'authorization_code', {
        code: 'docmost-credential-check',
        redirect_uri: callbackUrl,
      });
      return 'unknown';
    } catch (err) {
      if (err instanceof ResponseBodyError) {
        if (err.error === 'invalid_client' || err.status === 401) {
          return 'invalid';
        }
        if (err.error === 'invalid_grant') return 'valid';
      }
      return 'unknown';
    }
  }

  private async testFacebookCredentials(
    provider: AuthProvider,
    settings: EffectiveSsoSettings,
  ): Promise<SsoTestResult> {
    const tokenEndpoint = `https://graph.facebook.com/${settings.facebookGraphVersion}/oauth/access_token`;
    const base = {
      authorizationEndpoint: `https://www.facebook.com/${settings.facebookGraphVersion}/dialog/oauth`,
      tokenEndpoint,
      userinfoEndpoint: `https://graph.facebook.com/${settings.facebookGraphVersion}/me`,
      tokenAuthMethod: 'client_secret_post',
      warnings: [] as string[],
    };

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: provider.oidcClientId!,
          client_secret: provider.oidcClientSecret!,
          grant_type: 'client_credentials',
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_SECONDS * 1000),
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (response.ok && typeof body.access_token === 'string') {
        return {
          ...base,
          ok: true,
          message: 'Facebook accepted the app ID and app secret.',
          credentials: 'valid',
        };
      }

      return {
        ...base,
        ok: false,
        message: 'Facebook rejected the app ID or app secret.',
        credentials: 'invalid',
      };
    } catch (err) {
      return {
        ...base,
        ok: false,
        message: `Could not reach Facebook: ${this.describeError(err)}`,
        credentials: 'unknown',
      };
    }
  }

  private buildProviderPatch(
    provider: AuthProvider,
    payload: ProviderMutationPayload,
  ): UpdatableAuthProvider {
    if (provider.type !== SSO_PROVIDER_TYPE) {
      throw new BadRequestException(
        'This fork only supports configuring OIDC-based providers.',
      );
    }

    const preset = getProviderPreset(provider);
    const patch: UpdatableAuthProvider = {};

    if (typeof payload.name === 'string') {
      patch.name = payload.name.trim();
    }
    if (typeof payload.oidcClientId === 'string') {
      patch.oidcClientId = payload.oidcClientId.trim();
    }
    if (
      typeof payload.oidcClientSecret === 'string' &&
      payload.oidcClientSecret.trim()
    ) {
      patch.oidcClientSecret = payload.oidcClientSecret.trim();
    }
    if (typeof payload.isEnabled === 'boolean') {
      patch.isEnabled = payload.isEnabled;
    }
    if (typeof payload.allowSignup === 'boolean') {
      patch.allowSignup = payload.allowSignup;
    }
    if (typeof payload.groupSync === 'boolean') {
      patch.groupSync =
        payload.groupSync && getPresetDefinition(preset).supportsGroups;
    }

    const settings = this.mergeSettings(provider, payload.settings);
    if (settings) {
      patch.settings = settings;
    }

    const effectiveSettings = (settings ??
      provider.settings ??
      {}) as SsoProviderSettings;
    const storedIssuer =
      preset === 'generic' && typeof payload.oidcIssuer === 'string'
        ? payload.oidcIssuer.trim()
        : provider.oidcIssuer;
    const issuer = resolveIssuer(preset, effectiveSettings, storedIssuer);
    if (issuer !== provider.oidcIssuer) {
      patch.oidcIssuer = issuer;
    }

    return patch;
  }

  private mergeSettings(
    provider: AuthProvider,
    incoming: SsoProviderSettings | undefined,
  ): SsoProviderSettings | undefined {
    if (!incoming) {
      return undefined;
    }

    const settings: SsoProviderSettings = {
      ...((provider.settings ?? {}) as SsoProviderSettings),
    };
    // Settings written before presets existed belong to generic providers.
    settings.preset = getProviderPreset(provider);

    for (const key of SETTINGS_STRING_KEYS) {
      const value = incoming[key];
      if (typeof value !== 'string') continue;

      let normalized = value.trim();
      if (key === 'keycloakUrl') normalized = normalized.replace(/\/+$/, '');
      if (key === 'microsoftTenantId' || key === 'googleHostedDomain') {
        normalized = normalized.toLowerCase();
      }

      if (normalized) {
        settings[key] = normalized;
      } else {
        delete settings[key];
      }
    }

    for (const key of SETTINGS_LIST_KEYS) {
      const value = incoming[key];
      if (!Array.isArray(value)) continue;
      settings[key] = [
        ...new Set(value.map((item) => item.trim()).filter(Boolean)),
      ].slice(0, MAX_SETTINGS_LIST_ITEMS);
    }

    if (typeof incoming.prompt === 'string') {
      settings.prompt = incoming.prompt;
    }
    if (typeof incoming.tokenAuthMethod === 'string') {
      settings.tokenAuthMethod = incoming.tokenAuthMethod;
    }
    if (typeof incoming.requireVerifiedEmail === 'boolean') {
      settings.requireVerifiedEmail = incoming.requireVerifiedEmail;
    }

    return settings;
  }

  private buildNewProvider(
    workspaceId: string,
    creatorId: string | null,
    requestedPreset: string | undefined,
  ): InsertableAuthProvider {
    const preset: SsoPreset = isSsoPreset(requestedPreset)
      ? requestedPreset
      : 'generic';
    const settings = buildDefaultSettings(preset);

    return {
      name: getPresetDefinition(preset).defaultName,
      type: SSO_PROVIDER_TYPE,
      allowSignup: false,
      isEnabled: false,
      groupSync: false,
      creatorId,
      workspaceId,
      samlUrl: null,
      samlCertificate: null,
      oidcIssuer: resolveIssuer(preset, settings, null),
      oidcClientId: null,
      oidcClientSecret: null,
      ldapUrl: null,
      ldapBindDn: null,
      ldapBindPassword: null,
      ldapBaseDn: null,
      ldapUserSearchFilter: null,
      ldapUserAttributes: {},
      ldapTlsEnabled: false,
      ldapTlsCaCert: null,
      ldapConfig: {},
      settings,
      deletedAt: null,
    };
  }

  private assertCompleteIfEnabled(provider: AuthProvider) {
    if (!provider.isEnabled) return;
    const missing = getMissingConfig(provider);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Set the ${missing.join(', ')} before enabling this provider.`,
      );
    }
  }

  private buildCallbackUrl(origin: string, providerId: string) {
    return `${origin}/api/sso/oidc/${providerId}/callback`;
  }

  private resolveProviderId(payload: ProviderMutationPayload) {
    const providerId = payload.providerId || payload.id;
    if (!providerId) {
      throw new BadRequestException('Provider id is required.');
    }
    return providerId;
  }

  private async getProviderOrThrow(
    workspaceId: string,
    providerId: string,
    trx?: KyselyTransaction,
  ) {
    if (!providerId) {
      throw new BadRequestException('Provider id is required.');
    }
    const provider = await (trx ?? this.db)
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!provider) {
      throw new NotFoundException('SSO provider not found.');
    }

    return provider;
  }

  private async getUsableProvider(workspaceId: string, providerId: string) {
    const provider = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (
      !provider ||
      provider.type !== SSO_PROVIDER_TYPE ||
      !provider.isEnabled ||
      getMissingConfig(provider).length > 0
    ) {
      throw new SsoLoginError(
        'provider_unavailable',
        `SSO provider ${providerId} is missing, disabled, or incomplete.`,
      );
    }

    return provider;
  }

  private sanitizeProvider(provider: AuthProvider): SafeAuthProvider {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      oidcIssuer: provider.oidcIssuer,
      oidcClientId: provider.oidcClientId,
      allowSignup: provider.allowSignup,
      isEnabled: provider.isEnabled,
      groupSync: provider.groupSync,
      creatorId: provider.creatorId,
      workspaceId: provider.workspaceId,
      settings: provider.settings,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      deletedAt: provider.deletedAt,
      hasOidcClientSecret: Boolean(provider.oidcClientSecret),
    };
  }

  private describeError(err: unknown): string {
    if (
      err instanceof ResponseBodyError ||
      err instanceof AuthorizationResponseError
    ) {
      return err.error_description
        ? `${err.error}: ${err.error_description}`
        : err.error;
    }
    const cause = (err as { cause?: unknown } | null)?.cause;
    if (err instanceof Error && cause instanceof Response) {
      return `${err.message} (HTTP ${cause.status})`;
    }
    if (err instanceof Error) {
      const response = (err as { response?: unknown }).response;
      if (
        typeof response === 'object' &&
        response !== null &&
        'message' in response &&
        typeof response.message === 'string'
      ) {
        return response.message;
      }
      return err.message;
    }
    return String(err);
  }
}
