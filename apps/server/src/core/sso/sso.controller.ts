import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { UserRole } from '../../common/helpers/types/permission';

const SSO_STATE_COOKIE = 'docmostOidcState';

@Controller('sso')
export class SsoController {
  constructor(
    private readonly ssoService: SsoService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  async providers(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user);
    return this.ssoService.listProviders(workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { providerId?: string; id?: string },
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
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.ssoService.createProvider(
      workspace.id,
      user.id,
      body as Partial<any>,
    );
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.ssoService.updateProvider(workspace.id, body as Partial<any>);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { providerId?: string; id?: string },
  ) {
    this.assertAdmin(user);
    await this.ssoService.deleteProvider(workspace.id, body.providerId || body.id);
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
    const workspaceId = this.requireWorkspaceId(
      (req.raw as any)?.workspaceId ?? req.workspaceId,
    );
    const providerId = (req.params as any).providerId as string;
    const origin = this.ssoService.buildOrigin(
      req.headers.host,
      req.headers['x-forwarded-proto'] as string | undefined,
    );
    const redirectPath = this.ssoService.sanitizeRedirectPath(redirect);
    const result = await this.ssoService.buildOidcLoginUrl({
      providerId,
      workspaceId,
      origin,
      redirectPath,
    });

    res.setCookie(
      SSO_STATE_COOKIE,
      this.ssoService.encodeStateCookie(result.state),
      {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: this.environmentService.isHttps(),
      },
    );

    return res.code(302).redirect(result.url);
  }

  @Public()
  @SkipTransform()
  @Get('oidc/:providerId/callback')
  async oidcCallback(
    @Req() req: FastifyRequest & { workspaceId?: string },
    @Res({ passthrough: false }) res: FastifyReply,
  ) {
    const workspaceId = this.requireWorkspaceId(
      (req.raw as any)?.workspaceId ?? req.workspaceId,
    );
    const providerId = (req.params as any).providerId as string;
    const cookieState = this.ssoService.decodeStateCookie(
      req.cookies?.[SSO_STATE_COOKIE],
    );

    res.clearCookie(SSO_STATE_COOKIE, { path: '/' });

    if (!cookieState || cookieState.providerId !== providerId) {
      throw new ForbiddenException('Invalid OIDC state.');
    }

    const callbackOrigin = this.ssoService.buildOrigin(
      req.headers.host,
      req.headers['x-forwarded-proto'] as string | undefined,
    );
    const user = await this.ssoService.finishOidcLogin({
      workspaceId,
      cookieState,
      currentUrl: `${callbackOrigin}${req.url}`,
      callbackUrl: `${cookieState.origin}/api/sso/oidc/${providerId}/callback`,
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
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Admin access is required.');
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
