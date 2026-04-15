import { afterAll } from 'bun:test';
import { closeDatabase } from '@/database/database.ts';

afterAll(async () => {
  await closeDatabase();
});
