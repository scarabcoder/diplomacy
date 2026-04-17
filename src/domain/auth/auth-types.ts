import * as z from 'zod/v4';
import type { InferSelectModel } from 'drizzle-orm';
import { sessionTable, userTable } from '@/database/schema/auth-schema.ts';

export type User = InferSelectModel<typeof userTable>;
export type DbSession = InferSelectModel<typeof sessionTable>;
export type UserSession = { session: DbSession; user: User };

export const dbSessionSchema = z.object({
  id: z.string(),
  expiresAt: z.date(),
  token: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  userId: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const userSessionSchema = z.object({
  session: dbSessionSchema,
  user: userSchema,
});

export const nullableUserSessionSchema = userSessionSchema.nullable();

export function sanitizeUserSession(input: unknown): UserSession | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    session?: Partial<DbSession> | null;
    user?: Partial<User> | null;
  };

  if (!candidate.session || !candidate.user) {
    return null;
  }

  return {
    session: {
      id: candidate.session.id ?? '',
      expiresAt: candidate.session.expiresAt ?? new Date(0),
      token: candidate.session.token ?? '',
      createdAt: candidate.session.createdAt ?? new Date(0),
      updatedAt: candidate.session.updatedAt ?? new Date(0),
      ipAddress: candidate.session.ipAddress ?? null,
      userAgent: candidate.session.userAgent ?? null,
      userId: candidate.session.userId ?? '',
    },
    user: {
      id: candidate.user.id ?? '',
      name: candidate.user.name ?? '',
      email: candidate.user.email ?? '',
      emailVerified: candidate.user.emailVerified ?? false,
      image: candidate.user.image ?? null,
      createdAt: candidate.user.createdAt ?? new Date(0),
      updatedAt: candidate.user.updatedAt ?? new Date(0),
    },
  };
}
