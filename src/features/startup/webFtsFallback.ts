import type { CatalogDb } from '@/core/catalog';

/**
 * WEB PREVIEW ONLY (`npm run preview`). The WebAssembly SQLite that `expo-sqlite` ships for the web
 * is built without FTS5 ("no such module: fts5"), so the catalog's full-text search cannot run in a
 * browser. Android and iOS use the native SQLite, which has FTS5, and never load this file.
 *
 * This wraps the catalog port and answers the one FTS query `core/catalog` makes for `search` with a
 * plain `LIKE` over `food_name`. It is a rough stand-in so the screens can be walked through in a
 * browser: it does not rank like FTS5 and does not remove diacritics.
 */
export function withWebSearchFallback(db: CatalogDb): CatalogDb {
  return {
    all(sql, params = []) {
      if (!/food_fts MATCH \?/.test(sql)) return db.all(sql, params);
      const [match, locale, limit] = params as [string, string, number];
      const words = [...String(match).matchAll(/"([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
      const glue = / OR /.test(String(match)) ? ' OR ' : ' AND ';
      const where = words.map(() => 'lower(fn.name) LIKE ?').join(glue) || '0';
      return db.all(
        `SELECT fn.food_id AS food_id, fn.name AS name FROM food_name fn
          WHERE fn.locale IN (?, 'en') AND (${where})
          ORDER BY length(fn.name) LIMIT ?`,
        [locale, ...words.map((w) => `%${w}%`), limit],
      );
    },
  };
}
