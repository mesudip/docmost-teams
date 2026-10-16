import { Module } from '@nestjs/common';
import { PrivateSpaceModule } from './private-space/private-space.module';

@Module({
  imports: [PrivateSpaceModule],
})
export class TeamsModule {}
