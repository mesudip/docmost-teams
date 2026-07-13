import { Module } from '@nestjs/common';
import { PrivateSpaceModule } from './private-space/private-space.module';
import { SsoModule } from './sso/sso.module';

@Module({
  imports: [SsoModule, PrivateSpaceModule],
})
export class TeamsModule {}
