/** @jest-environment node */
/// <reference types="node" />
import { Readable } from 'node:stream';
import { splitArrayElements } from '../jsonStream';

async function collect(chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const el of splitArrayElements(Readable.from(chunks.map((c) => Buffer.from(c))))) out.push(el);
  return out;
}

describe('splitArrayElements', () => {
  const doc = '{"BrandedFoods":[{"a":1,"s":"x}\\"{,"},{"b":[1,2,{"c":3}]},{"d":"é"}],"other":[{"z":1}]}';

  it('yields each top-level object of the first array, whatever the chunk boundaries', async () => {
    const expected = ['{"a":1,"s":"x}\\"{,"}', '{"b":[1,2,{"c":3}]}', '{"d":"é"}'];
    expect(await collect([doc])).toEqual(expected);
    for (let size = 1; size <= 9; size++) {
      const parts: string[] = [];
      for (let i = 0; i < doc.length; i += size) parts.push(doc.slice(i, i + size));
      expect(await collect(parts)).toEqual(expected);
    }
  });

  it('keeps multi-byte characters intact when a chunk ends inside one', async () => {
    const bytes = Buffer.from('{"X":[{"n":"ñandú"}]}');
    const cut = bytes.indexOf(0xc3) + 1;
    const out: string[] = [];
    for await (const el of splitArrayElements(Readable.from([bytes.subarray(0, cut), bytes.subarray(cut)]))) out.push(el);
    expect(out).toEqual(['{"n":"ñandú"}']);
  });

  it('yields nothing for an empty array and parses every element as JSON', async () => {
    expect(await collect(['{"X":[]}'])).toEqual([]);
    for (const el of await collect([doc])) expect(() => JSON.parse(el)).not.toThrow();
  });
});
