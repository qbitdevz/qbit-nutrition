import { defineConfig } from 'drizzle-kit';

/**
 * Generates the committed SQL migrations for `app.db` (docs/08 section 8):
 *   npx drizzle-kit generate
 * `driver: 'expo'` also emits `migrations.js`, which bundles the SQL files into the app
 * (needs the `.sql` handling in babel.config.js and metro.config.js).
 */
export default defineConfig({
  schema: './src/data/schema.ts',
  out: './src/data/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
