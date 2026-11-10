import { UserRole } from '../enums/user-role.enum';

export interface UserPayload {
  userId: string;
  email: string;
  username: string;
  roles: UserRole[];
}

export interface TokenPayload extends UserPayload {
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
  type: 'access' | 'refresh';
}

export interface RefreshTokenPayload extends TokenPayload {
  type: 'refresh';
  sessionId: string;
}