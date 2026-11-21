/**
 * The bundled `catalog.db` as a Metro asset. `catalog-build/` is git-ignored: run
 * `npm run catalog:build` before bundling or building the app, or Metro fails to resolve this
 * require (on purpose: an app without a catalog must not build). See src/data/README.md.
 */
export const catalogAssetModule: number = require('../../../catalog-build/catalog.db');
