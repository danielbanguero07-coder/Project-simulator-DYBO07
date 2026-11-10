import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const requestId = headers['x-request-id'] as string || 'unknown';
    const startTime = Date.now();

    this.logger.log(
      `📥 ${method} ${url} - IP: ${ip} - UA: ${userAgent} - ReqID: ${requestId}`,
    );

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          this.logger.log(
            `📤 ${method} ${url} - ${statusCode} - ${duration}ms - ReqID: ${requestId}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `❌ ${method} ${url} - ${error.status || 500} - ${duration}ms - ReqID: ${requestId}`,
            error.stack,
          );
        },
      }),
    );
  }
}