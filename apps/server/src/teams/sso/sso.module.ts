import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';
import { AuthModule } from '../../core/auth/auth.module';
import { WorkspaceModule } from '../../core/workspace/workspace.module';

@Module({
  imports: [AuthModule, WorkspaceModule],
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
