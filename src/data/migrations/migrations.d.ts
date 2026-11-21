/** Types for the `migrations.js` that `drizzle-kit generate` writes (driver `expo`). */
declare const bundle: {
  /** SQL text per migration, keyed by `<timestamp>_<name>` (sorted by key when applied). */
  migrations: Record<string, string>;
};
export default bundle;
