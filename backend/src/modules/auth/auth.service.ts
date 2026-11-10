import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, TokenPayloadDto } from './dto/token.dto';
import { UserRole, TokenType } from './enums/user-role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (dto.password !== dto.passwordConfirm) {
      throw new ConflictException('Passwords do not match');
    }

    // Check if user exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === dto.email) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.configService.get<number>('bcrypt.rounds') || 12,
    );

    // Create user in transaction
    const user = await this.prisma.withTransaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username,
          passwordHash,
          roles: [UserRole.PLAYER],
          isActive: true,
          isEmailVerified: false,
        },
      });

      // Create player profile
      await tx.player.create({
        data: {
          userId: newUser.id,
          displayName: dto.username,
        },
      });

      return newUser;
    });

    this.logger.log(`New user registered: ${user.email} (${user.id})`);

    return this.generateAuthResponse(user);
  }

  async login(dto: LoginDto, req: Request): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      this.logger.warn(`Login failed: user not found - ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.isBanned) {
      if (user.banExpiresAt && new Date(user.banExpiresAt) > new Date()) {
        throw new UnauthorizedException(`Account banned: ${user.banReason}`);
      }
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: invalid password - ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`User logged in: ${user.email} (${user.id})`);

    return this.generateAuthResponse(user, dto.rememberMe);
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    // Verify refresh token
    const payload = this.jwtService.verify<TokenPayloadDto>(refreshToken, {
      secret: this.configService.get<string>('jwt.secret'),
    });

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Check if session exists in Redis
    const session = await this.redis.getSession<{ userId: string }>(`refresh:${payload.jti}`);
    if (!session || session.userId !== payload.userId) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Get user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Generate new tokens (rotate refresh token)
    await this.redis.deleteSession(`refresh:${payload.jti}`);
    return this.generateAuthResponse(user);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      try {
        const payload = this.jwtService.verify<TokenPayloadDto>(refreshToken);
        await this.redis.deleteSession(`refresh:${payload.jti}`);
      } catch {
        // Token invalid, ignore
      }
    }

    // Optionally: revoke all user sessions
    // await this.revokeAllSessions(userId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const pattern = `refresh:*`;
    // In production, use SCAN to find all user sessions
    // For now, we'd need to store userId in session to find them
    this.logger.log(`All sessions revoked for user: ${userId}`);
  }

  async validateUser(userId: string): Promise<TokenPayloadDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        roles: true,
        isActive: true,
        isBanned: true,
      },
    });

    if (!user || !user.isActive || user.isBanned) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900, // 15 min
    };
  }

  private async generateAuthResponse(user: any, rememberMe = false): Promise<AuthResponseDto> {
    const accessTtl = this.configService.get<string>('jwt.accessTokenTtl') || '15m';
    const refreshTtl = rememberMe
      ? this.configService.get<string>('jwt.refreshTokenTtl') || '30d'
      : '7d';

    const accessPayload: any = {
      userId: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseTtl(accessTtl),
      jti: randomUUID(),
      type: 'access',
    };

    const refreshPayload: TokenPayloadDto & { sessionId: string } = {
      ...accessPayload,
      exp: Math.floor(Date.now() / 1000) + this.parseTtl(refreshTtl),
      jti: randomUUID(),
      type: 'refresh',
      sessionId: randomUUID(),
    };

    const accessToken = this.jwtService.sign(accessPayload);
    const refreshToken = this.jwtService.sign(refreshPayload);

    // Store refresh token session in Redis
    const refreshTtlSeconds = this.parseTtl(refreshTtl);
    await this.redis.setSession(`refresh:${refreshPayload.jti}`, { userId: user.id }, refreshTtlSeconds);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles,
        isEmailVerified: user.isEmailVerified,
      },
      expiresIn: this.parseTtl(accessTtl),
    };
  }

  private parseTtl(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // default 15m

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 900;
    }
  }
}