/// <reference types="node" />
import { createReadStream, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { createInflateRaw } from 'node:zlib';

/**
 * Yields the text of each top-level object of the first array in a JSON document, without holding the document in
 * memory. Needed for FoodData Central's Branded Foods file (about 3 GB of JSON), which no parser can load whole.
 */
export async function* splitArrayElements(source: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let started = false; // inside the array
  let depth = 0;
  let inString = false;
  let escaped = false;
  let current = '';
  for await (const chunk of source) {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (!started) {
        if (c === 0x5b) started = true; // [
        from = i + 1;
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (c === 0x5c) escaped = true;
        else if (c === 0x22) inString = false;
        continue;
      }
      if (c === 0x22) inString = true;
      else if (c === 0x7b || c === 0x5b) {
        if (depth === 0) {
          current = '';
          from = i;
        }
        depth++;
      } else if (c === 0x7d || c === 0x5d) {
        if (depth === 0) return; // the closing "]" of the array
        depth--;
        if (depth === 0) {
          yield current + text.slice(from, i + 1);
          current = '';
          from = i + 1;
        }
      }
    }
    if (depth > 0) current += text.slice(from);
  }
}

/** Streams the first `.json` entry of a zip file, inflated. Reads the central directory only; no zip64. */
export function streamZipJson(file: string): NodeJS.ReadableStream {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    let e = tailLen - 22;
    while (e >= 0 && tail.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Not a zip file: end of central directory not found');
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOffset = tail.readUInt32LE(e + 16);
    if (cdOffset === 0xffffffff) throw new Error('zip64 archives are not supported');
    const cd = Buffer.alloc(cdSize);
    readSync(fd, cd, 0, cdSize, cdOffset);
    let p = 0;
    for (let n = 0; n < count; n++) {
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (!name.toLowerCase().endsWith('.json')) continue;
      const local = Buffer.alloc(30);
      readSync(fd, local, 0, 30, localOffset);
      const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const raw = createReadStream(file, { start, end: start + compSize - 1 });
      if (method === 0) return raw;
      if (method === 8) return raw.pipe(createInflateRaw());
      throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    }
    throw new Error('No .json file inside the zip');
  } finally {
    closeSync(fd);
  }
}
