const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Drizzle migration files are imported as modules (see babel.config.js).
config.resolver.sourceExts.push('sql');

// Web preview only (`npm run web`): expo-sqlite on the web bundles a WebAssembly build of SQLite and
// needs SharedArrayBuffer, which browsers allow only on cross-origin isolated pages. These two
// settings change nothing for the Android bundle: Android has no `.wasm` imports, and the headers
// are sent by the development server only. See node_modules/expo-sqlite/skills/expo-sqlite.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhanced = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhanced(req, res, next);
  };
};

module.exports = config;
