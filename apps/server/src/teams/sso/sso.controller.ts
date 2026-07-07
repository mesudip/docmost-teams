import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SsoService } from './sso.service';
import {
  CreateSsoProviderDto,
  ProviderIdDto,
  UpdateSsoProviderDto,
} from './dto/sso-provider.dto';

@Controller('sso')
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  providers(@AuthWorkspace() workspace: Workspace) {
    return this.ssoService.getProviders(workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CreateSsoProviderDto,
  ) {
    return this.ssoService.createProvider(dto, user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateSsoProviderDto,
  ) {
    return this.ssoService.updateProvider(dto, user, workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  delete(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: ProviderIdDto,
  ) {
    return this.ssoService.deleteProvider(dto.providerId, user, workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthWorkspace() workspace: Workspace, @Body() dto: ProviderIdDto) {
    return this.ssoService.getProvider(dto.providerId, workspace.id);
  }

  @Get('oidc/:providerId/login')
  async oidcLogin(
    @AuthWorkspace() workspace: Workspace,
    @Param('providerId') providerId: string,
    @Query('redirect') redirect: string,
    @Res() res: FastifyReply,
  ) {
    const result = await this.ssoService.getOidcAuthorizationUrl(
      providerId,
      workspace,
      redirect,
    );
    res
      .setCookie(result.cookieName, result.cookieValue, result.cookieOptions)
      .redirect(result.authorizationUrl);
  }

  @Get('oidc/:providerId/callback')
  async oidcCallback(
    @AuthWorkspace() workspace: Workspace,
    @Param('providerId') providerId: string,
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    const result = await this.ssoService.handleOidcCallback(
      providerId,
      workspace,
      query,
      req.cookies?.[this.ssoService.getStateCookieName(providerId)],
    );
    res
      .setCookie('authToken', result.authToken, result.authCookieOptions)
      .clearCookie(result.stateCookieName, { path: '/' })
      .redirect(result.redirectTo);
  }
}
