import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsFQDN,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FACEBOOK_GRAPH_VERSION_PATTERN,
  MICROSOFT_TENANT_ID_PATTERN,
  SSO_PRESETS,
  SSO_PROMPTS,
  SSO_TOKEN_AUTH_METHODS,
  SsoPreset,
  SsoPrompt,
  SsoTokenAuthMethod,
} from './sso-presets';

const isNonEmptyString = (_: unknown, value: unknown) =>
  typeof value === 'string' && value.trim().length > 0;

export class ProviderIdDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  id?: string;
}

export class SsoProviderSettingsDto {
  // Empty strings reset a setting to the preset default.
  @IsOptional()
  @ValidateIf(isNonEmptyString)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(512)
  keycloakUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\?#]*$/, { message: 'Realm must not contain / ? # or \\' })
  keycloakRealm?: string;

  @IsOptional()
  @ValidateIf(isNonEmptyString)
  @Matches(MICROSOFT_TENANT_ID_PATTERN, {
    message: 'Tenant ID must be the directory (tenant) ID GUID',
  })
  microsoftTenantId?: string;

  @IsOptional()
  @ValidateIf(isNonEmptyString)
  @IsFQDN()
  @MaxLength(253)
  googleHostedDomain?: string;

  @IsOptional()
  @ValidateIf(isNonEmptyString)
  @Matches(FACEBOOK_GRAPH_VERSION_PATTERN, {
    message: 'Graph API version must look like v26.0',
  })
  facebookGraphVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  scopes?: string;

  @IsOptional()
  @IsIn(SSO_PROMPTS)
  prompt?: SsoPrompt;

  @IsOptional()
  @IsIn(SSO_TOKEN_AUTH_METHODS)
  tokenAuthMethod?: SsoTokenAuthMethod;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  groupClaimName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  groupFilter?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  ownerGroups?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  adminGroups?: string[];

  @IsOptional()
  @IsBoolean()
  requireVerifiedEmail?: boolean;
}

// Fields an admin edits in the provider form.
export class SsoProviderConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @ValidateIf(isNonEmptyString)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  @MaxLength(512)
  oidcIssuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  oidcClientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
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
  @Type(() => SsoProviderSettingsDto)
  settings?: SsoProviderSettingsDto;
}

export class CreateSsoProviderDto extends SsoProviderConfigDto {
  // Lets the form show the final callback URL before the provider is saved.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(['oidc'])
  type: 'oidc';

  @IsOptional()
  @IsIn(SSO_PRESETS)
  preset?: SsoPreset;
}

export class UpdateSsoProviderDto extends SsoProviderConfigDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  id?: string;
}

// Without a provider id, tests an unsaved provider of the given preset.
export class TestSsoProviderDto extends UpdateSsoProviderDto {
  @IsOptional()
  @IsIn(SSO_PRESETS)
  preset?: SsoPreset;
}
