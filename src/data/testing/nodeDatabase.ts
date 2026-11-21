/// <reference types="node" />
/**
 * Test-only: opens `app.db` on Node's built-in `node:sqlite` through Drizzle's own `node-sqlite`
 * driver. The app opens the same schema through Drizzle's `expo-sqlite` driver. Both drivers are
 * synchronous Drizzle `SQLiteAsyncDatabase<'sync'>` instances, so repositories, schema and
 * migrations are the same code in both. Never import this from app code.
 */
import { drizzle } from 'drizzle-orm/node-sqlite';
import { DatabaseSync } from 'node:sqlite';
import type { AppDatabase } from '../database';

export interface NodeAppDatabase {
  db: AppDatabase;
  client: DatabaseSync;
  close(): void;
}

/** `path` defaults to a private in-memory database; pass a file path to reopen it later. */
export function openNodeDatabase(path = ':memory:'): NodeAppDatabase {
  const client = new DatabaseSync(path);
  const db = drizzle({ client });
  return { db, client, close: () => client.close() };
}
