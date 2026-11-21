const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle migration files are imported as modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

module.exports = config;
