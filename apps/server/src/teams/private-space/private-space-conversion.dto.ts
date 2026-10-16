import { IsBoolean, IsUUID } from 'class-validator';

export class ConvertPersonalSpaceDto {
  @IsUUID()
  spaceId: string;

  @IsBoolean()
  isPersonal: boolean;
}
