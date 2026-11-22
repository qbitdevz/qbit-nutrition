import en from '../en.json';
import es from '../es.json';

/** Removing or replacing an imported table removes its favorites and recents AND the matches the app learned for its foods: the text says all of it. */
describe('what removing or replacing an imported table says it removes', () => {
  const keys = (d: typeof en) => [
    d.import.batch.duplicate.replaceHint,
    d.import.list.removeBody_one,
    d.import.list.removeBody_other,
    d.import.list.dups.confirmBody_one,
    d.import.list.dups.confirmBody_other,
  ];
  it.each([
    ['English', en, /favorites/, /recents/, /learned match/],
    ['Spanish', es, /favoritos/, /recientes/, /coincidencias aprendidas/],
  ] as const)('%s names favorites, recents and learned matches', (_name, dict, a, b, c) => {
    for (const text of keys(dict as typeof en)) {
      expect(text).toMatch(a);
      expect(text).toMatch(b);
      expect(text).toMatch(c);
    }
  });
});
