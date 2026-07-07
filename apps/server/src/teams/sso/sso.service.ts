import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CookieSerializeOptions } from '@fastify/cookie';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { InjectKysely } from 'nestjs-kysely';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  fetchUserInfo,
  randomPKCECodeVerifier,
  randomState,
  randomNonce,
} from 'openid-client';
import { KyselyDB } from '../../database/types/kysely.types';
import { AuthProvider, User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { validateAllowedEmail } from '../../core/auth/auth.util';
import { nanoIdGen } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';
import { executeTx } from '@docmost/db/utils';
import {
  CreateSsoProviderDto,
  UpdateSsoProviderDto,
} from './dto/sso-provider.dto';

const OIDC_STATE_COOKIE_PREFIX = 'docmost_oidc_state_';
const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

interface OidcStateCookie {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
  providerId: string;
  workspaceId: string;
  expiresAt: number;
}

interface OidcClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

@Injectable()
export class SsoService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async getProviders(workspaceId: string) {
    const items = await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();

    return { items, meta: { hasPrevPage: false, hasNextPage: false } };
  }

  async getProvider(providerId: string, workspaceId: string) {
    const provider = await this.findProvider(providerId, workspaceId);
    if (!provider) {
      throw new NotFoundException('SSO provider not found');
    }
    return provider;
  }

  async createProvider(
    dto: CreateSsoProviderDto,
    user: User,
    workspace: Workspace,
  ) {
    this.ensureWorkspaceAdmin(user);
    if (dto.type !== 'oidc') {
      throw new BadRequestException(
        'Only OIDC providers are supported in this EE build.',
      );
    }

    return this.db
      .insertInto('authProviders')
      .values({
        name: dto.name,
        type: dto.type,
        creatorId: user.id,
        workspaceId: workspace.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateProvider(
    dto: UpdateSsoProviderDto,
    user: User,
    workspaceId: string,
  ) {
    this.ensureWorkspaceAdmin(user);
    await this.getProvider(dto.providerId, workspaceId);

    const update: Record<string, string | boolean | Date> = {};
    for (const key of [
      'name',
      'oidcIssuer',
      'oidcClientId',
      'oidcClientSecret',
      'allowSignup',
      'isEnabled',
      'groupSync',
    ] as const) {
      if (dto[key] !== undefined) {
        update[key] = dto[key] as never;
      }
    }

    if (Object.keys(update).length === 0) {
      return this.getProvider(dto.providerId, workspaceId);
    }

    return this.db
      .updateTable('authProviders')
      .set({ ...update, updatedAt: new Date() })
      .where('id', '=', dto.providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteProvider(providerId: string, user: User, workspaceId: string) {
    this.ensureWorkspaceAdmin(user);
    await this.getProvider(providerId, workspaceId);
    await this.db
      .updateTable('authProviders')
      .set({ deletedAt: new Date(), isEnabled: false, updatedAt: new Date() })
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async getOidcAuthorizationUrl(
    providerId: string,
    workspace: Workspace,
    redirect?: string,
  ) {
    const provider = await this.getEnabledOidcProvider(
      providerId,
      workspace.id,
    );
    const config = await this.getOidcConfig(provider);
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    const nonce = randomNonce();
    const redirectUri = this.getCallbackUrl(provider.id);
    const authorizationUrl = buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    }).href;

    const stateCookie: OidcStateCookie = {
      state,
      nonce,
      codeVerifier,
      providerId: provider.id,
      workspaceId: workspace.id,
      redirectTo: this.getSafeRedirect(redirect),
      expiresAt: Date.now() + OIDC_STATE_TTL_MS,
    };

    return {
      authorizationUrl,
      cookieName: this.getStateCookieName(provider.id),
      cookieValue: this.encodeStateCookie(stateCookie),
      cookieOptions: this.shortLivedCookieOptions(),
    };
  }

  async handleOidcCallback(
    providerId: string,
    workspace: Workspace,
    query: Record<string, string>,
    stateCookieValue?: string,
  ) {
    const provider = await this.getEnabledOidcProvider(
      providerId,
      workspace.id,
    );
    const stateCookie = this.readStateCookie(provider.id, stateCookieValue);

    if (
      stateCookie.workspaceId !== workspace.id ||
      stateCookie.providerId !== provider.id
    ) {
      throw new UnauthorizedException('Invalid SSO login state.');
    }
    if (stateCookie.expiresAt < Date.now()) {
      throw new UnauthorizedException('Expired SSO login state.');
    }
    if (query.state !== stateCookie.state) {
      throw new UnauthorizedException('Invalid SSO login state.');
    }

    const config = await this.getOidcConfig(provider);
    const currentUrl = new URL(this.getCallbackUrl(provider.id));
    Object.entries(query).forEach(([key, value]) =>
      currentUrl.searchParams.set(key, value),
    );

    const tokens = await authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: stateCookie.codeVerifier,
      expectedState: stateCookie.state,
      expectedNonce: stateCookie.nonce,
    });

    const claims = tokens.claims() as OidcClaims;
    const profile = await this.getClaims(
      provider,
      tokens.access_token,
      claims.sub,
    );
    const user = await this.resolveUser(provider, workspace, profile);

    await this.userRepo.updateLastLogin(user.id, workspace.id);
    const authToken = await this.sessionService.createSessionAndToken(user);

    return {
      authToken,
      redirectTo: stateCookie.redirectTo,
      stateCookieName: this.getStateCookieName(provider.id),
      authCookieOptions: this.authCookieOptions(),
    };
  }

  private ensureWorkspaceAdmin(user: User): void {
    if (![UserRole.ADMIN, UserRole.OWNER].includes(user.role as UserRole)) {
      throw new ForbiddenException(
        'Only workspace admins can manage SSO providers.',
      );
    }
  }

  private async resolveUser(
    provider: AuthProvider,
    workspace: Workspace,
    claims: OidcClaims,
  ): Promise<User> {
    if (!claims.sub) {
      throw new UnauthorizedException(
        'OIDC provider did not return a subject claim.',
      );
    }

    const linked = (await this.db
      .selectFrom('authAccounts')
      .innerJoin('users', 'users.id', 'authAccounts.userId')
      .select(this.userRepo.baseFields.map((field) => `users.${field}` as any))
      .where('authAccounts.authProviderId', '=', provider.id)
      .where('authAccounts.providerUserId', '=', claims.sub)
      .where('authAccounts.workspaceId', '=', workspace.id)
      .where('authAccounts.deletedAt', 'is', null)
      .where('users.deletedAt', 'is', null)
      .executeTakeFirst()) as User | undefined;

    if (linked) {
      if (linked.deactivatedAt) {
        throw new ForbiddenException('User is deactivated.');
      }
      return linked;
    }

    if (!provider.allowSignup) {
      throw new ForbiddenException('SSO signup is disabled for this provider.');
    }
    if (!claims.email) {
      throw new UnauthorizedException(
        'OIDC provider did not return an email claim.',
      );
    }
    if (claims.email_verified === false) {
      throw new UnauthorizedException(
        'OIDC provider did not verify this email address.',
      );
    }

    validateAllowedEmail(claims.email, workspace);

    return executeTx(this.db, async (trx) => {
      let user = await this.userRepo.findByEmail(claims.email, workspace.id, {
        trx,
      });
      if (!user) {
        user = await this.userRepo.insertUser(
          {
            email: claims.email,
            name:
              claims.name ||
              claims.preferred_username ||
              claims.email.split('@')[0],
            password: nanoIdGen(32),
            avatarUrl: claims.picture ?? null,
            role: UserRole.MEMBER,
            workspaceId: workspace.id,
            emailVerifiedAt: new Date(),
            hasGeneratedPassword: true,
          },
          trx,
        );
      } else if (user.deactivatedAt) {
        throw new ForbiddenException('User is deactivated.');
      }

      await trx
        .insertInto('authAccounts')
        .values({
          userId: user.id,
          providerUserId: claims.sub,
          authProviderId: provider.id,
          workspaceId: workspace.id,
        })
        .onConflict((oc) =>
          oc.columns(['userId', 'authProviderId']).doNothing(),
        )
        .execute();

      return user;
    });
  }

  private async getClaims(
    provider: AuthProvider,
    accessToken?: string,
    subject?: string,
  ): Promise<OidcClaims> {
    const idClaims = (subject ? { sub: subject } : {}) as OidcClaims;
    if (!accessToken || !subject) {
      return idClaims;
    }

    const config = await this.getOidcConfig(provider);
    const userInfo = (await fetchUserInfo(
      config,
      accessToken,
      subject,
    )) as OidcClaims;
    return { ...idClaims, ...userInfo };
  }

  private async getEnabledOidcProvider(
    providerId: string,
    workspaceId: string,
  ) {
    const provider = await this.findProvider(providerId, workspaceId);
    if (!provider || provider.type !== 'oidc' || !provider.isEnabled) {
      throw new NotFoundException('OIDC provider not found or disabled.');
    }
    if (
      !provider.oidcIssuer ||
      !provider.oidcClientId ||
      !provider.oidcClientSecret
    ) {
      throw new BadRequestException('OIDC provider is not fully configured.');
    }
    return provider;
  }

  private findProvider(providerId: string, workspaceId: string) {
    return this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  private getOidcConfig(provider: AuthProvider) {
    return discovery(
      new URL(provider.oidcIssuer),
      provider.oidcClientId,
      provider.oidcClientSecret,
    );
  }

  private getCallbackUrl(providerId: string): string {
    return `${this.environmentService.getAppUrl()}/api/sso/oidc/${providerId}/callback`;
  }

  getStateCookieName(providerId: string): string {
    return `${OIDC_STATE_COOKIE_PREFIX}${providerId}`;
  }

  private readStateCookie(
    providerId: string,
    rawState?: string,
  ): OidcStateCookie {
    if (!rawState) {
      throw new UnauthorizedException('Missing SSO login state.');
    }

    const [payload, signature] = rawState.split('.');
    if (!payload || !signature) {
      throw new UnauthorizedException('Invalid SSO login state.');
    }

    const expected = this.signStatePayload(payload);
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid SSO login state.');
    }

    return JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as OidcStateCookie;
  }

  private encodeStateCookie(stateCookie: OidcStateCookie): string {
    const payload = Buffer.from(JSON.stringify(stateCookie)).toString(
      'base64url',
    );
    return `${payload}.${this.signStatePayload(payload)}`;
  }

  private signStatePayload(payload: string): string {
    return createHmac('sha256', this.environmentService.getAppSecret())
      .update(payload)
      .digest('base64url');
  }

  private getSafeRedirect(redirect?: string): string {
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
      return '/home';
    }
    return redirect;
  }

  private shortLivedCookieOptions(): CookieSerializeOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: OIDC_STATE_TTL_MS / 1000,
      secure: this.environmentService.isHttps(),
    };
  }

  private authCookieOptions(): CookieSerializeOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    };
  }
}
