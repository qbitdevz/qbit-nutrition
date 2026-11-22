/** @jest-environment node */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { bundledMigrations, initializeDatabase, type AppDatabase } from '../database';
import { DataError } from '../errors';
import { openNodeDatabase } from '../testing/nodeDatabase';

const EXPECTED_TABLES = [
  'profile',
  'goal',
  'body_measurement',
  'meal',
  'meal_item',
  'meal_item_nutrient',
  'scan',
  'ai_provider',
  'custom_food',
  'food_collection',
  'imported_food',
  'imported_food_token',
  'barcode_product',
  'food_usage',
  'match_memory',
  'setting',
];

const names = (db: AppDatabase, type: 'table' | 'index'): string[] =>
  db
    .all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = ${type} AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .map((r) => r.name);

/** Column lists of every index on `table`. */
const indexColumns = (db: AppDatabase, table: string): string[][] =>
  db
    .all<{ name: string }>(sql`SELECT name FROM pragma_index_list(${table})`)
    .map((idx) =>
      db
        .all<{ name: string }>(sql`SELECT name FROM pragma_index_info(${idx.name}) ORDER BY seqno`)
        .map((c) => c.name),
    );

describe('migrations', () => {
  it('create every table and the indexes of docs/08 section 6', async () => {
    const { db, close } = openNodeDatabase();
    await initializeDatabase(db);

    const tables = names(db, 'table');
    for (const t of EXPECTED_TABLES) expect(tables).toContain(t);

    // meal(local_date), meal_item(meal_id), body_measurement(kind, measured_on), food_usage(last_used_at)
    const indexed = (table: string) => indexColumns(db, table);
    expect(indexed('meal')).toContainEqual(['local_date']);
    expect(indexed('meal_item')).toContainEqual(['meal_id']);
    expect(indexed('body_measurement')).toContainEqual(['kind', 'measured_on']);
    expect(indexed('food_usage')).toContainEqual(['last_used_at']);
    close();
  });

  it('are idempotent when the app starts a second time on the same file', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'qn-app-')), 'app.db');
    const first = openNodeDatabase(file);
    await initializeDatabase(first.db);
    first.db.run(sql`INSERT INTO setting (key, value) VALUES ('theme', 'dark')`);
    first.close();

    const second = openNodeDatabase(file);
    await initializeDatabase(second.db);
    await initializeDatabase(second.db);
    expect(
      second.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`)[0]?.n,
    ).toBe(Object.keys(bundledMigrations.migrations).length);
    expect(second.db.all<{ value: string }>(sql`SELECT value FROM setting`)).toEqual([
      { value: 'dark' },
    ]);
    second.close();
  });

  it('turn foreign keys on', async () => {
    const { db, close } = openNodeDatabase();
    await initializeDatabase(db);
    expect(db.all<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`)[0]?.foreign_keys).toBe(1);
    close();
  });

  it('roll back completely when one fails and report a typed error', async () => {
    const { db, close } = openNodeDatabase();
    await initializeDatabase(db);
    db.run(sql`INSERT INTO setting (key, value) VALUES ('theme', 'dark')`);
    const before = names(db, 'table');

    const broken = {
      migrations: {
        ...bundledMigrations.migrations,
        // First statement is valid, the second one fails: the first must not survive.
        '99990101000000_broken':
          'CREATE TABLE `half_done` (`id` text PRIMARY KEY);\n--> statement-breakpoint\nCREATE TABLE `setting` (`id` text);',
      },
    };

    const error = await initializeDatabase(db, broken).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).code).toBe('migration_failed');

    expect(names(db, 'table')).toEqual(before);
    expect(names(db, 'table')).not.toContain('half_done');
    expect(db.all<{ value: string }>(sql`SELECT value FROM setting`)).toEqual([{ value: 'dark' }]);
    expect(
      db.all<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`)[0]?.n,
    ).toBe(Object.keys(bundledMigrations.migrations).length);

    // The next start with the good bundle still works.
    await expect(initializeDatabase(db)).resolves.toBeUndefined();
    close();
  });

  it('leave a brand-new database without user tables when the first migration fails', async () => {
    const { db, close } = openNodeDatabase();
    const error = await initializeDatabase(db, {
      migrations: { '20260101000000_bad': 'CREATE TABLE a (id text);\n--> statement-breakpoint\nNOT SQL;' },
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect((error as DataError).code).toBe('migration_failed');
    expect(names(db, 'table')).not.toContain('a');
    close();
  });

  it('allow at most one active AI provider', async () => {
    const { db, close } = openNodeDatabase();
    await initializeDatabase(db);
    const insert = (id: string, active: number) =>
      db.run(
        sql`INSERT INTO ai_provider (id, label, adapter, base_url, model, timeout_s, is_active) VALUES (${id}, 'x', 'anthropic', 'https://example.com', 'm', 30, ${active})`,
      );
    insert('a', 1);
    insert('b', 0);
    insert('c', 0);
    expect(() => insert('d', 1)).toThrow();
    close();
  });

  it('give no table a column that could hold an API key', async () => {
    const { db, close } = openNodeDatabase();
    await initializeDatabase(db);
    const columns = names(db, 'table').flatMap((table) =>
      db
        .all<{ name: string }>(sql`SELECT name FROM pragma_table_info(${table})`)
        .map((c) => ({ table, column: c.name.toLowerCase() })),
    );
    expect(columns.length).toBeGreaterThan(50);
    const suspicious = columns.filter(({ column }) =>
      /(api_?key|secret|token|password|credential|bearer|authorization)/.test(column),
    );
    // `input_tokens` / `output_tokens` are usage counters on `scan`, not credentials.
    expect(suspicious.filter((c) => !/^(input|output)_tokens$/.test(c.column))).toEqual([]);
    expect(columns.filter((c) => c.table === 'ai_provider').map((c) => c.column)).toEqual(
      expect.arrayContaining(['id', 'label', 'adapter', 'base_url', 'model']),
    );
    close();
  });
});
