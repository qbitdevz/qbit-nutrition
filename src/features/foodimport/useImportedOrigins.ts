import { useEffect, useState } from 'react';

import { useServices } from '../startup/AppProvider';
import type { ImportedOrigin } from '../logging/foods';

const NONE: ReadonlyMap<string, ImportedOrigin> = new Map();

/**
 * For the ids of foods saved as `custom`, which of them come from a table the person imported and from which one (S5). Ids of the
 * person's own custom foods are simply absent. Read again when the ids change; a failed read shows no origin rather than an error,
 * because the origin is a label on a screen that is complete without it.
 */
export function useImportedOrigins(ids: readonly string[]): ReadonlyMap<string, ImportedOrigin> {
  const services = useServices();
  const key = [...new Set(ids)].sort().join('|');
  // The answer is kept with the ids it belongs to: while other ids are being read, the screen shows none rather than the wrong ones.
  const [read, setRead] = useState<{ key: string; origins: ReadonlyMap<string, ImportedOrigin> }>({ key: '', origins: NONE });

  useEffect(() => {
    if (key === '') return;
    let active = true;
    services.repos.importedFoods.originsOf(key.split('|')).then(
      (found) => active && setRead({ key, origins: new Map([...found].map(([id, origin]) => [id, { collection: origin.collectionName, basis: origin.basis }])) }),
      () => active && setRead({ key, origins: NONE }),
    );
    return () => {
      active = false;
    };
  }, [services, key]);

  return read.key === key ? read.origins : NONE;
}
