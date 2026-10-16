import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SsoService } from './sso.service';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SessionService } from '../../core/session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { UserRole } from '../../common/helpers/types/permission';
import {
  CreateSsoProviderDto,
  ProviderIdDto,
  TestSsoProviderDto,
  UpdateSsoProviderDto,
} from './sso-provider.dto';
import { SsoLoginError, SsoLoginErrorCode } from './sso-login-error';

const SSO_STATE_COOKIE = 'docmostOidcState';
const SSO_STATE_TTL_SECONDS = 10 * 60;

// OIDC and OAuth2 presets (including Facebook) share the /sso/oidc routes so
// upstream's client routing for the `oidc` provider type keeps working.
//
// Admins can view providers, but only owners can change or test them: a
// provider decides who can sign in as which account (accounts are matched by
// email) and which identity-provider groups become workspace owners, so
// letting admins edit it would let them make themselves owners.
@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly ssoService: SsoService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  async providers(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user);
    return this.ssoService.listProviders(workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: ProviderIdDto,
  ) {
    this.assertAdmin(user);
    return this.ssoService.getProvider(
      workspace.id,
      body.providerId || body.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: CreateSsoProviderDto,
  ) {
    this.assertOwner(user);
    return this.ssoService.createProvider(workspace.id, user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: UpdateSsoProviderDto,
  ) {
    this.assertOwner(user);
    return this.ssoService.updateProvider(workspace.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('test')
  async test(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: TestSsoProviderDto,
  ) {
    this.assertOwner(user);
    return this.ssoService.testProvider(workspace.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: ProviderIdDto,
  ) {
    this.assertOwner(user);
    await this.ssoService.deleteProvider(
      workspace.id,
      body.providerId || body.id,
    );
    return { success: true };
  }

  @Public()
  @SkipTransform()
  @Get('oidc/:providerId/login')
  async oidcLogin(
    @Req() req: FastifyRequest & { workspaceId?: string },
    @Res({ passthrough: false }) res: FastifyReply,
    @Query('redirect') redirect?: string,
  ) {
    const providerId = (req.params as any).providerId as string;
    // Errors before the request origin is validated go back to APP_URL.
    let origin = this.environmentService.getAppUrl();

    try {
      const workspaceId = this.requireWorkspaceId(
        (req.raw as any)?.workspaceId ?? req.workspaceId,
      );
      // Throws for hosts outside the allowlist; nothing is redirected there.
      origin = this.ssoService.buildOrigin(
        req.headers.host,
        req.headers['x-forwarded-proto'] as string | undefined,
      );

      const result = await this.ssoService.buildLoginUrl({
        providerId,
        workspaceId,
        origin,
        redirectPath: this.ssoService.sanitizeRedirectPath(redirect),
      });

      res.setCookie(
        SSO_STATE_COOKIE,
        this.ssoService.encodeStateCookie(result.state),
        {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: SSO_STATE_TTL_SECONDS,
          secure: this.environmentService.isHttps(),
        },
      );

      return res.code(302).redirect(result.url);
    } catch (err) {
      return this.redirectWithError(res, origin, err, providerId);
    }
  }

  @Public()
  @SkipTransform()
  @Get('oidc/:providerId/callback')
  async oidcCallback(
    @Req() req: FastifyRequest & { workspaceId?: string },
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const providerId = (req.params as any).providerId as string;
    const cookieState = this.ssoService.decodeStateCookie(
      req.cookies?.[SSO_STATE_COOKIE],
    );

    res.clearCookie(SSO_STATE_COOKIE, { path: '/' });

    const origin = cookieState?.origin ?? this.resolveFallbackOrigin(req);

    try {
      const workspaceId = this.requireWorkspaceId(
        (req.raw as any)?.workspaceId ?? req.workspaceId,
      );
      if (!cookieState || cookieState.providerId !== providerId) {
        throw new SsoLoginError('state_invalid', 'Invalid SSO login state.');
      }

      // Rebuilt on the login origin so the redirect_uri sent with the token
      // request matches the one used for the authorization request.
      const user = await this.ssoService.finishLogin({
        workspaceId,
        cookieState,
        currentUrl: new URL(req.url, cookieState.origin),
      });
      const authToken = await this.sessionService.createSessionAndToken(user);

      this.setAuthCookie(res, authToken);
      return res
        .code(302)
        .redirect(
          `${cookieState.origin}${this.ssoService.sanitizeRedirectPath(
            cookieState.redirectPath,
          )}`,
        );
    } catch (err) {
      return this.redirectWithError(res, origin, err, providerId);
    }
  }

  private redirectWithError(
    res: FastifyReply,
    origin: string,
    err: unknown,
    providerId: string,
  ) {
    const code: SsoLoginErrorCode =
      err instanceof SsoLoginError ? err.code : 'sso_failed';
    const message = err instanceof Error ? err.message : String(err);

    if (code === 'sso_failed') {
      this.logger.error(
        `SSO login with provider ${providerId} failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    } else {
      this.logger.warn(
        `SSO login with provider ${providerId} failed (${code}): ${message}`,
      );
    }

    const params = new URLSearchParams({ sso_error: code });
    return res.code(302).redirect(`${origin}/login?${params.toString()}`);
  }

  private resolveFallbackOrigin(req: FastifyRequest): string {
    try {
      return this.ssoService.buildOrigin(
        req.headers.host,
        req.headers['x-forwarded-proto'] as string | undefined,
      );
    } catch {
      return this.environmentService.getAppUrl();
    }
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Admin access is required.');
    }
  }

  private assertOwner(user: User) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only workspace owners can change SSO providers.',
      );
    }
  }

  private requireWorkspaceId(workspaceId?: string) {
    if (!workspaceId) {
      throw new ForbiddenException('Workspace context is required.');
    }

    return workspaceId;
  }

  private setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
