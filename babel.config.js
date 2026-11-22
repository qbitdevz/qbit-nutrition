module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Bundles the Drizzle migration files (`*.sql`) as strings (src/data/migrations/migrations.js).
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
