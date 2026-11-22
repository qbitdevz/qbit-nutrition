/**
 * Bytes to text, with no `TextDecoder` (Hermes does not ship one on every platform): a table downloaded from a
 * publisher may be UTF-8 (with or without a byte order mark), UTF-16 (a "Unicode text" export of a spreadsheet) or
 * Latin-1 / Windows-1252 (older Spanish and Portuguese tables). The order of the checks is the order of certainty:
 * a byte order mark says what the file is; otherwise bytes that are valid UTF-8 almost surely are; anything else is
 * Windows-1252, which agrees with Latin-1 everywhere except 0x80-0x9F (there it has the euro sign, quotes, dashes).
 */
export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

const CHUNK = 8192;

/** Windows-1252 code points of 0x80-0x9F (undefined bytes map to themselves, as browsers do). */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function fromCodeUnits(units: number[]): string {
  return String.fromCharCode.apply(null, units);
}

/** Strict UTF-8: null as soon as a byte sequence is not valid (overlong forms, surrogates and truncation included). */
function decodeUtf8(bytes: Uint8Array, start: number): string | null {
  const parts: string[] = [];
  let units: number[] = [];
  const push = (unit: number) => {
    units.push(unit);
    if (units.length >= CHUNK) {
      parts.push(fromCodeUnits(units));
      units = [];
    }
  };
  let i = start;
  const n = bytes.length;
  while (i < n) {
    const b = bytes[i]!;
    if (b < 0x80) {
      push(b);
      i += 1;
      continue;
    }
    let need = 0;
    let code = 0;
    let min = 0;
    if (b >= 0xc2 && b <= 0xdf) [need, code, min] = [1, b & 0x1f, 0x80];
    else if (b >= 0xe0 && b <= 0xef) [need, code, min] = [2, b & 0x0f, 0x800];
    else if (b >= 0xf0 && b <= 0xf4) [need, code, min] = [3, b & 0x07, 0x10000];
    else return null;
    for (let k = 1; k <= need; k++) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
    if (code >= 0x10000) {
      const v = code - 0x10000;
      push(0xd800 + (v >> 10));
      push(0xdc00 + (v & 0x3ff));
    } else push(code);
    i += need + 1;
  }
  parts.push(fromCodeUnits(units));
  return parts.join('');
}

function decodeUtf16(bytes: Uint8Array, start: number, littleEndian: boolean): string {
  const parts: string[] = [];
  let units: number[] = [];
  for (let i = start; i + 1 < bytes.length; i += 2) {
    units.push(littleEndian ? bytes[i]! | (bytes[i + 1]! << 8) : (bytes[i]! << 8) | bytes[i + 1]!);
    if (units.length >= CHUNK) {
      parts.push(fromCodeUnits(units));
      units = [];
    }
  }
  parts.push(fromCodeUnits(units));
  return parts.join('');
}

function decodeCp1252(bytes: Uint8Array): string {
  const parts: string[] = [];
  let units: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    units.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : b);
    if (units.length >= CHUNK) {
      parts.push(fromCodeUnits(units));
      units = [];
    }
  }
  parts.push(fromCodeUnits(units));
  return parts.join('');
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = decodeUtf8(bytes, 3);
    if (text !== null) return { text, encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decodeUtf16(bytes, 2, true), encoding: 'utf-16le' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decodeUtf16(bytes, 2, false), encoding: 'utf-16be' };
  const utf8 = decodeUtf8(bytes, 0);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  return { text: decodeCp1252(bytes), encoding: 'windows-1252' };
}
