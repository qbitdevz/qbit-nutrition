export { parseBarcode } from './code';
export type { BarcodeFormat, BarcodeParse } from './code';
export { BarcodeLookupError } from './errors';
export type { BarcodeLookupErrorCode } from './errors';
export { DEFAULT_TIMEOUT_MS, OFF_FIELDS, OFF_HOST, createOpenFoodFactsClient } from './offClient';
export type { OpenFoodFactsClient, OpenFoodFactsOptions } from './offClient';
export type { OffProduct } from './offSchema';
export { HEADLINE_FIELDS, MAX_GRAMS_100G, MAX_KCAL_100G, MAX_MICRO_100G, MAX_SERVING_G, isComplete, mapProduct } from './product';
export type { BarcodeProduct, NamePreference, ProductField } from './product';
