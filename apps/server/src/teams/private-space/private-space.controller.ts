import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { nanoIdGen } from '../../common/helpers';
import { SpaceService } from '../../core/space/services/space.service';
import { CreatePrivateSpaceDto } from './private-space.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/private')
export class PrivateSpaceController {
  constructor(private readonly spaceService: SpaceService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreatePrivateSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const allowPrivateSpaces =
      (workspace.settings as Record<string, any>)?.spaces?.allowPersonal ===
      true;

    if (!allowPrivateSpaces) {
      throw new ForbiddenException(
        'Private spaces are disabled in this workspace',
      );
    }

    return this.spaceService.createSpace(
      user,
      workspace.id,
      { name: dto.name, slug: `private-${nanoIdGen()}` },
      undefined,
      { isPersonal: true },
    );
  }
}
