/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PRIVACY_VERSION } from '../../features/legal/version';
import en from '../en.json';
import es from '../es.json';

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The quoted block that follows a marker line in docs/12, as plain text (quote marks, bold and bullets removed). */
function quoteAfter(doc: string, marker: string): string {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.trim() === marker);
  expect(start).toBeGreaterThan(-1);
  const quoted: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('>')) quoted.push(line.replace(/^>\s?/, '').replace(/^- /, ''));
    else if (quoted.length > 0 && line.trim() === '') break;
    else if (quoted.length > 0) break;
  }
  return squash(quoted.join(' ').replace(/\*\*/g, ''));
}

type Disclaimer = typeof en.legal.disclaimer;
const noticeText = (d: Disclaimer) =>
  squash([d.title, d.intro, ...(['estimates', 'targets', 'professional', 'allergens'] as const).map((k) => `${d[k].lead} ${d[k].body}`), d.closing].join(' '));

describe('the health notice is verbatim from docs/12 section 2 (S8)', () => {
  const doc = read('docs/12-legal-and-privacy.md');

  it('English', () => {
    expect(noticeText(en.legal.disclaimer)).toBe(quoteAfter(doc, '**English**'));
  });

  it('Spanish', () => {
    expect(noticeText(es.legal.disclaimer)).toBe(quoteAfter(doc, '**Español**'));
  });
});

describe('the privacy policy', () => {
  const md = read('PRIVACY.md');
  const policy = en.legal.privacy;
  const sections = ['summary', 'stores', 'never', 'health', 'control', 'children', 'changes', 'contact'] as const;

  it('is published at the repository root as PRIVACY.md with the English text of the app, marked as a draft pending legal review', () => {
    for (const key of sections) expect(md).toContain(`**${policy[key].lead}** ${policy[key].body}`);
    expect(md).toContain(`# ${policy.title}`);
    expect(md).toContain(`**${policy.leaves.lead}**`);
    expect(md).toContain(policy.leaves.note);
    for (const row of ['photo', 'suggest', 'barcode', 'export'] as const) {
      expect(md).toContain(`| ${policy.leaves[row].action} | ${policy.leaves[row].data} | ${policy.leaves[row].recipient} |`);
    }
    expect(md).toContain(en.legal.version.draft);
    expect(md).toContain(`Last updated: ${PRIVACY_VERSION}.`);
  });

  it('has a Spanish translation with the same parts, each filled in', () => {
    const flatten = (value: object, prefix = ''): [string, string][] =>
      Object.entries(value).flatMap(([key, v]) => (typeof v === 'object' && v !== null ? flatten(v, `${prefix}${key}.`) : [[`${prefix}${key}`, String(v)] as [string, string]]));
    const english = new Map(flatten(en.legal.privacy));
    const spanish = new Map(flatten(es.legal.privacy));
    expect([...english.keys()]).toEqual([...spanish.keys()]);
    for (const [key, value] of spanish) {
      expect(value.trim()).not.toBe('');
      // Names, addresses and settings paths stay as they are; every other string is translated, not copied.
      if (!/(recipient|contact\.body)/.test(key)) expect(value).not.toBe(english.get(key));
    }
  });

  it('keeps the promises of docs/12 section 3 in both languages: nothing collected, no tracking, what leaves only on request', () => {
    expect(squash(Object.values(en.legal.privacy.never).join(' '))).toMatch(/no accounts, no analytics, no advertising, no crash reports, no tracking/i);
    expect(en.legal.privacy.summary.body).toMatch(/do not collect, receive, or store any of it/);
    expect(es.legal.privacy.summary.body).toMatch(/no recopilamos, recibimos ni almacenamos ninguno/);
  });

  it('names Health Connect and each action that sends data in the current text', () => {
    expect(en.legal.privacy.health.body).toMatch(/Health Connect/);
    expect(Object.keys(en.legal.privacy.leaves).filter((k) => ['photo', 'suggest', 'barcode', 'export'].includes(k))).toHaveLength(4);
  });
});
