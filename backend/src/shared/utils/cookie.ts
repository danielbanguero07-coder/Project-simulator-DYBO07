import { NextFunction, Request, Response } from 'express';

/**
 * Minimal cookie parser middleware.
 *
 * The app does not depend on `cookie-parser`, but several features (JWT
 * strategy, refresh tokens and logout) read `req.cookies`. Parsing the
 * `Cookie` header here keeps cookie based auth working without extra deps.
 */
export function cookieParser(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers?.cookie;
  const cookies: Record<string, string> = {};

  if (header) {
    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator === -1) continue;

      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!key) continue;

      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }

  (req as any).cookies = cookies;
  next();
}
