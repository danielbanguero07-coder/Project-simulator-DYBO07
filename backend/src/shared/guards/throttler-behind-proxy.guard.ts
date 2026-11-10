import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Trust X-Forwarded-For header when behind proxy
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = forwarded
      ? String(forwarded).split(',')[0].trim()
      : req.ip || req.socket?.remoteAddress || 'unknown';
    return ip;
  }
}