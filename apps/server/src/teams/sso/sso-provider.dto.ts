import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ProviderIdDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  id?: string;
}

export class OidcProviderSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupClaimName?: string;

  @IsOptional()
  @IsBoolean()
  requireVerifiedEmail?: boolean;
}

export class CreateSsoProviderDto {
  @IsIn(['oidc'])
  type: 'oidc';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class UpdateSsoProviderDto extends ProviderIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  oidcClientId?: string;

  @IsOptional()
  @IsString()
  oidcClientSecret?: string;

  @IsOptional()
  @IsBoolean()
  allowSignup?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSync?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OidcProviderSettingsDto)
  settings?: OidcProviderSettingsDto;
}
