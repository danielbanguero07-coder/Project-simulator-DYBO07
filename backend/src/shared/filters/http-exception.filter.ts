import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any = null;
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
      code = (exceptionResponse as any).error || 'HTTP_ERROR';
      errors = (exceptionResponse as any).details || null;
    } else if (this.isPrismaKnownRequestError(exception)) {
      ({ status, message, code, errors } = this.handlePrismaError(exception as any));
    } else if (this.isPrismaValidationError(exception)) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data provided';
      code = 'VALIDATION_ERROR';
      errors = (exception as any).message;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      message = 'Validation failed';
      code = 'ZOD_VALIDATION_ERROR';
      errors = exception.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
        { requestId, path: request.url, method: request.method },
      );
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        ...(errors && { details: errors }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        requestId,
      },
    };

    // Log based on severity
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception instanceof Error ? exception.stack : '',
        { requestId },
      );
    } else if (status >= 400) {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`,
        { requestId },
      );
    }

    response.status(status).json(errorResponse);
  }

  // Prisma error classes are not always available at runtime (depending on the
  // generated client), so detect them by name instead of using `instanceof`.
  private isPrismaKnownRequestError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.name === 'PrismaClientKnownRequestError' &&
      typeof (error as any).code === 'string'
    );
  }

  private isPrismaValidationError(error: unknown): boolean {
    return error instanceof Error && error.name === 'PrismaClientValidationError';
  }

  private handlePrismaError(error: any): {
    status: number;
    message: string;
    code: string;
    errors: any;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
          code: 'DUPLICATE_ENTRY',
          errors: { field: error.meta?.target },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          code: 'FOREIGN_KEY_CONSTRAINT',
          errors: { field: error.meta?.field_name },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          code: 'NOT_FOUND',
          errors: { cause: error.meta?.cause },
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Transaction conflict, please retry',
          code: 'TRANSACTION_CONFLICT',
          errors: null,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          code: 'DATABASE_ERROR',
          errors: { prismaCode: error.code },
        };
    }
  }
}