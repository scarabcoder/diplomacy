import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { database } from '@/database/database.ts';
import * as schema from '@/database/schema';

export const auth = betterAuth({
  database: drizzleAdapter(database, {
    provider: 'pg',
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  baseURL: process.env.BASE_URL as string,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [tanstackStartCookies()],
});
