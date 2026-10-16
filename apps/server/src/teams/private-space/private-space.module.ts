import { Module } from '@nestjs/common';
import { SpaceModule } from '../../core/space/space.module';
import { PrivateSpaceController } from './private-space.controller';
import { PrivateSpaceService } from './private-space.service';

@Module({
  imports: [SpaceModule],
  controllers: [PrivateSpaceController],
  providers: [PrivateSpaceService],
})
export class PrivateSpaceModule {}
