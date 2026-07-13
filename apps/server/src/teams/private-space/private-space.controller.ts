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
import { PrivateSpaceService } from './private-space.service';
import { ConvertPersonalSpaceDto } from './private-space-conversion.dto';
import { UserRole } from '../../common/helpers/types/permission';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';

@UseGuards(JwtAuthGuard)
@Controller('spaces/private')
export class PrivateSpaceController {
  constructor(
    private readonly spaceService: SpaceService,
    private readonly privateSpaceService: PrivateSpaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
  ) {}

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

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  async convert(
    @Body() dto: ConvertPersonalSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
    if (!space) {
      throw new ForbiddenException('Space access is required.');
    }

    if (space.isPersonal) {
      const ability = await this.spaceAbility.createForUser(user, space.id);
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException('Space admin access is required.');
      }
    } else {
      this.assertAdmin(user);
    }

    return this.privateSpaceService.convertSpace(
      dto.spaceId,
      workspace.id,
      dto.isPersonal,
    );
  }

  private assertAdmin(user: User) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Admin access is required.');
    }
  }
}
