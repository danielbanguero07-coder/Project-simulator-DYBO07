// Ambient type shims for version compatibility.
// NOTE: this file is a module (it has `export {}`) so that the `declare module`
// blocks below AUGMENT the real packages instead of replacing their types.

export {};

declare global {
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
      user?: any;
    }
  }
}

declare module 'passport-jwt' {
  // `fromCookie` is not present in @types/passport-jwt 4.x but some deployments
  // use a patched/extended version. Declared as an optional static helper.
  namespace ExtractJwt {
    function fromCookie(cookieName: string): (req: any) => string | null;
  }
}

declare module 'socket.io' {
  interface Handshake {
    cookies?: Record<string, string>;
  }
}
