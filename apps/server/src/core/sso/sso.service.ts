import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  AuthProvider,
  InsertableAuthAccount,
  InsertableGroup,
  InsertableAuthProvider,
  UpdatableAuthProvider,
  User,
  Workspace,
} from '@docmost/db/types/entity.types';
import { SignupService } from '../auth/services/signup.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { nanoIdGen } from '../../common/helpers';
import { validateAllowedEmail } from '../auth/auth.util';
import { executeTx } from '@docmost/db/utils';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { UserRole } from '../../common/helpers/types/permission';
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  fetchUserInfo,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';

const OIDC_ONLY_PROVIDER_TYPE = 'oidc';
const ROOT_ADMIN_GROUP = 'root';

type SsoCookieState = {
  codeVerifier: string;
  origin: string;
  providerId: string;
  redirectPath: string;
  state: string;
};

type ProviderSettings = {
  groupClaimName?: string;
  requireVerifiedEmail?: boolean;
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

@Injectable()
export class SsoService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly signupService: SignupService,
    private readonly userRepo: UserRepo,
    private readonly environmentService: EnvironmentService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly watcherRepo: WatcherRepo,
    private readonly favoriteRepo: FavoriteRepo,
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

  async createProvider(
    workspaceId: string,
    userId: string,
    payload: Partial<AuthProvider>,
  ) {
    if (payload.type !== OIDC_ONLY_PROVIDER_TYPE) {
      throw new BadRequestException(
        'This fork only supports creating OIDC providers.',
      );
    }

    const insertable: InsertableAuthProvider = {
      name: payload.name?.trim() || 'OIDC',
      type: OIDC_ONLY_PROVIDER_TYPE,
      allowSignup: false,
      isEnabled: false,
      groupSync: false,
      creatorId: userId,
      workspaceId,
      samlUrl: null,
      samlCertificate: null,
      oidcIssuer: null,
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
      settings: {
        groupClaimName: 'groups',
        requireVerifiedEmail: true,
      },
      deletedAt: null,
    };

    const provider = await this.db
      .insertInto('authProviders')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.sanitizeProvider(provider);
  }

  async updateProvider(workspaceId: string, payload: Partial<AuthProvider>) {
    const providerId = this.resolveProviderId(payload);
    const provider = await this.getProviderOrThrow(workspaceId, providerId);

    if (provider.type !== OIDC_ONLY_PROVIDER_TYPE) {
      throw new BadRequestException(
        'This fork only supports configuring OIDC providers.',
      );
    }

    const patch: UpdatableAuthProvider = {};

    if (typeof payload.name === 'string') {
      patch.name = payload.name.trim();
    }
    if (typeof payload.oidcIssuer === 'string') {
      patch.oidcIssuer = payload.oidcIssuer.trim();
    }
    if (typeof payload.oidcClientId === 'string') {
      patch.oidcClientId = payload.oidcClientId.trim();
    }
    if (typeof payload.oidcClientSecret === 'string') {
      patch.oidcClientSecret = payload.oidcClientSecret.trim();
    }
    if (typeof payload.isEnabled === 'boolean') {
      patch.isEnabled = payload.isEnabled;
    }
    if (typeof payload.allowSignup === 'boolean') {
      patch.allowSignup = payload.allowSignup;
    }
    if (typeof payload.groupSync === 'boolean') {
      patch.groupSync = payload.groupSync;
    }
    const settings = this.resolveProviderSettings(provider, payload);
    if (settings) {
      patch.settings = settings;
    }

    this.validateOidcProviderConfig({
      ...provider,
      ...patch,
    } as AuthProvider);

    const updatedProvider = await this.db
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
  }

  async deleteProvider(workspaceId: string, providerId: string) {
    await this.getProviderOrThrow(workspaceId, providerId);

    await this.db
      .deleteFrom('authProviders')
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async buildOidcLoginUrl(opts: {
    providerId: string;
    workspaceId: string;
    origin: string;
    redirectPath: string;
  }): Promise<{ state: SsoCookieState; url: string }> {
    const provider = await this.getProviderOrThrow(
      opts.workspaceId,
      opts.providerId,
    );
    this.assertProviderUsable(provider);

    const callbackUrl = this.buildCallbackUrl(opts.origin, provider.id);
    const config = await this.getOidcClientConfig(provider, callbackUrl);
    const state = randomState();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    const url = buildAuthorizationUrl(config, {
      scope: 'openid profile email',
      response_type: 'code',
      // Force Keycloak to show a fresh login/account selection step instead of
      // silently reusing a previous IdP browser session after Docmost logout.
      prompt: 'login',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: callbackUrl,
    });

    return {
      url: url.toString(),
      state: {
        state,
        codeVerifier,
        providerId: provider.id,
        origin: opts.origin,
        redirectPath: opts.redirectPath,
      },
    };
  }

  async finishOidcLogin(opts: {
    callbackUrl: string;
    cookieState: SsoCookieState;
    currentUrl: string;
    workspaceId: string;
  }): Promise<User> {
    if (!opts.cookieState?.providerId || !opts.cookieState?.state) {
      throw new BadRequestException('Missing OIDC login state.');
    }

    const provider = await this.getProviderOrThrow(
      opts.workspaceId,
      opts.cookieState.providerId,
    );
    this.assertProviderUsable(provider);

    const config = await this.getOidcClientConfig(provider, opts.callbackUrl);
    const tokenResponse = await authorizationCodeGrant(
      config,
      new URL(opts.currentUrl),
      {
        expectedState: opts.cookieState.state,
        pkceCodeVerifier: opts.cookieState.codeVerifier,
      },
    );

    const claims = tokenResponse.claims();
    const subject = claims.sub;
    if (!subject) {
      throw new BadRequestException('OIDC response is missing subject.');
    }

    let email = this.readStringClaim(claims, 'email');
    let emailVerified = this.readBooleanClaim(claims, 'email_verified');
    let name =
      this.readStringClaim(claims, 'name') ||
      this.readStringClaim(claims, 'preferred_username');
    const groupClaimName = this.getGroupClaimName(provider);
    let normalizedGroups = this.readNormalizedGroupsClaim(
      claims,
      groupClaimName,
    );
    let userInfo: Record<string, unknown> | null = null;

    if (
      !email ||
      !name ||
      provider.groupSync ||
      (this.requiresVerifiedEmail(provider) && emailVerified === null)
    ) {
      userInfo = await fetchUserInfo(
        config,
        tokenResponse.access_token,
        subject,
      );
      email = email || this.readStringClaim(userInfo, 'email');
      emailVerified =
        emailVerified ?? this.readBooleanClaim(userInfo, 'email_verified');
      name =
        name ||
        this.readStringClaim(userInfo, 'name') ||
        this.readStringClaim(userInfo, 'preferred_username');
      if (provider.groupSync && normalizedGroups.length === 0) {
        normalizedGroups = this.readNormalizedGroupsClaim(
          userInfo,
          groupClaimName,
        );
      }
    }

    if (!email) {
      throw new BadRequestException(
        'OIDC provider did not return an email address.',
      );
    }

    if (this.requiresVerifiedEmail(provider) && emailVerified !== true) {
      throw new ForbiddenException(
        'This SSO provider requires an explicitly verified email address.',
      );
    }

    const workspace = await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', opts.workspaceId)
      .executeTakeFirstOrThrow();

    validateAllowedEmail(email, workspace as Workspace);

    let user = await this.findOrCreateUserFromOidc({
      workspace,
      provider,
      providerUserId: subject,
      email,
      name: name || email.split('@')[0],
    });

    if (provider.groupSync) {
      await this.syncOidcGroups({
        userId: user.id,
        workspaceId: opts.workspaceId,
        normalizedGroups,
        creatorId: provider.creatorId ?? user.id,
      });

      if (this.hasRootAdminGroup(normalizedGroups)) {
        user = await this.promoteToWorkspaceOwner(user);
      }
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

    return `${proto}://${resolvedHost}`;
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
    return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  }

  decodeStateCookie(raw?: string): SsoCookieState | null {
    if (!raw) return null;

    try {
      const parsed = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      ) as SsoCookieState;

      if (
        !parsed ||
        typeof parsed.codeVerifier !== 'string' ||
        typeof parsed.origin !== 'string' ||
        typeof parsed.providerId !== 'string' ||
        typeof parsed.redirectPath !== 'string' ||
        typeof parsed.state !== 'string'
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private async findOrCreateUserFromOidc(opts: {
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
      throw new ForbiddenException('This user account is not active.');
    }

    if (!user) {
      if (!opts.provider.allowSignup) {
        throw new ForbiddenException(
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
    } else if (!user.emailVerifiedAt || !user.hasGeneratedPassword) {
      await this.userRepo.updateUser(
        {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          hasGeneratedPassword: user.hasGeneratedPassword ?? false,
        },
        user.id,
        opts.workspace.id,
      );
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

  private async getOidcClientConfig(
    provider: AuthProvider,
    callbackUrl: string,
  ) {
    const issuer = new URL(provider.oidcIssuer!);
    const options =
      issuer.protocol === 'http:'
        ? { execute: [allowInsecureRequests] }
        : undefined;

    return discovery(
      issuer,
      provider.oidcClientId!,
      {
        client_secret: provider.oidcClientSecret!,
        redirect_uris: [callbackUrl],
        response_types: ['code'],
      },
      ClientSecretPost(provider.oidcClientSecret!),
      options,
    );
  }

  private buildCallbackUrl(origin: string, providerId: string) {
    return `${origin}/api/sso/oidc/${providerId}/callback`;
  }

  private resolveProviderId(
    payload: Partial<AuthProvider> & { providerId?: string },
  ) {
    const providerId = payload.providerId || payload.id;
    if (!providerId) {
      throw new BadRequestException('Provider id is required.');
    }
    return providerId;
  }

  private async getProviderOrThrow(workspaceId: string, providerId: string) {
    const provider = await this.db
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

  private assertProviderUsable(provider: AuthProvider) {
    if (provider.type !== OIDC_ONLY_PROVIDER_TYPE) {
      throw new BadRequestException('This fork only supports OIDC providers.');
    }

    if (!provider.isEnabled) {
      throw new BadRequestException('This SSO provider is disabled.');
    }

    this.validateOidcProviderConfig(provider);
  }

  private validateOidcProviderConfig(provider: AuthProvider) {
    if (
      !provider.name?.trim() ||
      !provider.oidcIssuer?.trim() ||
      !provider.oidcClientId?.trim() ||
      !provider.oidcClientSecret?.trim()
    ) {
      if (provider.isEnabled) {
        throw new BadRequestException(
          'OIDC issuer, client ID, and client secret are required before enabling this provider.',
        );
      }
    }
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

  private getGroupClaimName(provider: AuthProvider): string {
    const settings = (provider.settings ?? {}) as ProviderSettings;
    const value =
      typeof settings.groupClaimName === 'string'
        ? settings.groupClaimName.trim()
        : '';
    return value || 'groups';
  }

  private requiresVerifiedEmail(provider: AuthProvider): boolean {
    const settings = (provider.settings ?? {}) as ProviderSettings;
    return settings.requireVerifiedEmail !== false;
  }

  private hasRootAdminGroup(groups: string[]): boolean {
    return groups.some(
      (groupName) => groupName.trim().toLowerCase() === ROOT_ADMIN_GROUP,
    );
  }

  private async promoteToWorkspaceOwner(user: User): Promise<User> {
    if (user.role === UserRole.OWNER) {
      return user;
    }

    await this.userRepo.updateUser(
      { role: UserRole.OWNER },
      user.id,
      user.workspaceId,
    );

    return { ...user, role: UserRole.OWNER };
  }

  private resolveProviderSettings(
    provider: AuthProvider,
    payload: Partial<AuthProvider>,
  ): ProviderSettings | undefined {
    const incoming = payload.settings as ProviderSettings | undefined;
    if (!incoming) {
      return undefined;
    }

    const settings: ProviderSettings = {
      ...((provider.settings ?? {}) as ProviderSettings),
    };
    let changed = false;

    if (typeof incoming.groupClaimName === 'string') {
      settings.groupClaimName = incoming.groupClaimName.trim() || 'groups';
      changed = true;
    }
    if (typeof incoming.requireVerifiedEmail === 'boolean') {
      settings.requireVerifiedEmail = incoming.requireVerifiedEmail;
      changed = true;
    }

    return changed ? settings : undefined;
  }

  private readNormalizedGroupsClaim(
    source: Record<string, unknown> | undefined,
    key: string,
  ): string[] {
    const raw = source?.[key];
    if (!Array.isArray(raw)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const value of raw) {
      if (typeof value !== 'string') {
        continue;
      }

      const groupName = value.trim().replace(/^\/+|\/+$/g, '');
      if (!groupName) {
        continue;
      }

      const dedupeKey = groupName.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      normalized.push(groupName);
    }

    return normalized;
  }

  private async syncOidcGroups(opts: {
    userId: string;
    workspaceId: string;
    normalizedGroups: string[];
    creatorId?: string | null;
  }) {
    const desiredNames = [...new Set(opts.normalizedGroups)];

    await executeTx(this.db, async (trx) => {
      let workspaceGroups = await trx
        .selectFrom('groups')
        .select(['id', 'name', 'isDefault', 'isExternal'])
        .where('workspaceId', '=', opts.workspaceId)
        .where('deletedAt', 'is', null)
        .execute();

      const groupByLowerName = new Map(
        workspaceGroups.map((group) => [
          group.name.trim().toLowerCase(),
          group,
        ]),
      );

      for (const groupName of desiredNames) {
        const lookupKey = groupName.trim().toLowerCase();
        const existingGroup = groupByLowerName.get(lookupKey);

        if (existingGroup) {
          if (!existingGroup.isDefault && !existingGroup.isExternal) {
            await trx
              .updateTable('groups')
              .set({
                isExternal: true,
                updatedAt: new Date(),
              })
              .where('id', '=', existingGroup.id)
              .where('workspaceId', '=', opts.workspaceId)
              .execute();

            groupByLowerName.set(lookupKey, {
              ...existingGroup,
              isExternal: true,
            });
          }
          continue;
        }

        const insertableGroup: InsertableGroup = {
          name: groupName,
          description: null,
          isDefault: false,
          isExternal: true,
          creatorId: opts.creatorId ?? null,
          workspaceId: opts.workspaceId,
          deletedAt: null,
          scimExternalId: null,
        };

        const createdGroup = await trx
          .insertInto('groups')
          .values(insertableGroup)
          .returning(['id', 'name', 'isDefault', 'isExternal'])
          .executeTakeFirstOrThrow();

        groupByLowerName.set(lookupKey, createdGroup);
      }

      workspaceGroups = await trx
        .selectFrom('groups')
        .select(['id', 'name', 'isDefault', 'isExternal'])
        .where('workspaceId', '=', opts.workspaceId)
        .where('deletedAt', 'is', null)
        .execute();

      const desiredExternalGroupIds = workspaceGroups
        .filter(
          (group) =>
            !group.isDefault &&
            group.isExternal &&
            desiredNames.some(
              (groupName) =>
                group.name.trim().toLowerCase() ===
                groupName.trim().toLowerCase(),
            ),
        )
        .map((group) => group.id);

      const existingExternalMemberships = await trx
        .selectFrom('groupUsers')
        .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
        .select(['groupUsers.groupId'])
        .where('groupUsers.userId', '=', opts.userId)
        .where('groups.workspaceId', '=', opts.workspaceId)
        .where('groups.deletedAt', 'is', null)
        .where('groups.isDefault', '=', false)
        .where('groups.isExternal', '=', true)
        .execute();

      const existingExternalGroupIds = new Set(
        existingExternalMemberships.map((membership) => membership.groupId),
      );
      const desiredExternalGroupIdSet = new Set(desiredExternalGroupIds);

      const groupUsersToInsert = desiredExternalGroupIds
        .filter((groupId) => !existingExternalGroupIds.has(groupId))
        .map((groupId) => ({
          userId: opts.userId,
          groupId,
        }));

      if (groupUsersToInsert.length > 0) {
        await trx
          .insertInto('groupUsers')
          .values(groupUsersToInsert)
          .onConflict((oc) => oc.columns(['userId', 'groupId']).doNothing())
          .execute();
      }

      const groupIdsToRemove = [...existingExternalGroupIds].filter(
        (groupId) => !desiredExternalGroupIdSet.has(groupId),
      );

      if (groupIdsToRemove.length === 0) {
        return;
      }

      const affectedSpaceIds = new Set<string>();
      for (const groupId of groupIdsToRemove) {
        await trx
          .deleteFrom('groupUsers')
          .where('userId', '=', opts.userId)
          .where('groupId', '=', groupId)
          .execute();

        const spaceIds =
          await this.spaceMemberRepo.getSpaceIdsByGroupId(groupId);
        for (const spaceId of spaceIds) {
          affectedSpaceIds.add(spaceId);
        }
      }

      for (const spaceId of affectedSpaceIds) {
        await this.watcherRepo.deleteByUsersWithoutSpaceAccess(
          [opts.userId],
          spaceId,
          { trx },
        );
        await this.favoriteRepo.deleteByUsersWithoutSpaceAccess(
          [opts.userId],
          spaceId,
          { trx },
        );
      }
    });
  }

  private readStringClaim(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload?.[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private readBooleanClaim(
    payload: Record<string, unknown>,
    key: string,
  ): boolean | null {
    const value = payload?.[key];
    return typeof value === 'boolean' ? value : null;
  }
}
