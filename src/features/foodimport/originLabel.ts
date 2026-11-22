import type { TFunction } from 'i18next';

import type { ImportedOrigin } from '../logging/foods';

/** The tag text naming the table a food came from (S5): "Imported · Table name", with "per 100 ml" when the table is flagged. */
export function originLabel(t: TFunction, origin: ImportedOrigin): string {
  return t(origin.basis === 'ml' ? 'import.tagMl' : 'import.tag', { table: origin.collection });
}
