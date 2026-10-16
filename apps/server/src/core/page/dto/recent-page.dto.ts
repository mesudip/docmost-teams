import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RecentPageDto {
  @IsOptional()
  @IsString()
  spaceId: string;

  @IsOptional()
  @IsBoolean()
  personalOnly?: boolean;
}
