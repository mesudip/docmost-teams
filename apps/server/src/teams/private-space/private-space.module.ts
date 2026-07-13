import { Module } from '@nestjs/common';
import { SpaceModule } from '../../core/space/space.module';
import { PrivateSpaceController } from './private-space.controller';

@Module({
  imports: [SpaceModule],
  controllers: [PrivateSpaceController],
})
export class PrivateSpaceModule {}
