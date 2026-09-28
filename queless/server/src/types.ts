export type UserRole = 'customer' | 'business' | 'staff' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: UserRole;
}

export interface KioskIdentity {
  id: string;
  businessId: string;
  name: string;
}

export interface SessionData {
  userId?: string;
}

export interface DbError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      kiosk?: KioskIdentity;
    }
  }
}

