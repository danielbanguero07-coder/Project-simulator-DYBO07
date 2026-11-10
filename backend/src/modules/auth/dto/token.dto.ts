import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    username: string;
    roles: string[];
    isEmailVerified: boolean;
  };

  @ApiProperty()
  expiresIn: number;
}

export class TokenPayloadDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  roles: string[];

  @ApiProperty({ required: false })
  type?: 'access' | 'refresh';

  @ApiProperty({ required: false })
  jti?: string;

  @ApiProperty({ required: false })
  iss?: string;

  @ApiProperty()
  iat: number;

  @ApiProperty()
  exp: number;
}