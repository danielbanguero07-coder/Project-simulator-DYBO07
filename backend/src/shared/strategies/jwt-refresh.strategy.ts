import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.refresh_token || null,
        ExtractJwt.fromBodyField('refreshToken'),
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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
        isBanned: true,
        refreshTokenHash: true,
        roles: true,
      },
    });

    if (!user || !user.isActive || user.isBanned) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshToken = (req?.cookies?.refresh_token) ||
                         ExtractJwt.fromBodyField('refreshToken')(req);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    (req as any).user = user;
    (req as any).refreshToken = refreshToken;

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      roles: user.roles,
    };
  }
}