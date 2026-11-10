import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          return req?.cookies?.access_token || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
      issuer: configService.get<string>('jwt.issuer'),
      audience: configService.get<string>('jwt.audience'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const userId = payload.sub ?? payload.userId;

    // Check if user exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
        isBanned: true,
        banReason: true,
        banExpiresAt: true,
        roles: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (user.isBanned) {
      if (user.banExpiresAt && new Date(user.banExpiresAt) > new Date()) {
        throw new UnauthorizedException(`Account banned: ${user.banReason}`);
      }
      // Ban expired, could auto-unban here
    }

    // Attach user to request for guards
    (req as any).user = user;

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles,
    };
  }
}