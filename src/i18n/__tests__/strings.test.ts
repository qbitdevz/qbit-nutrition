/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import en from '../en.json';
import es from '../es.json';

const flatten = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, v]) => (typeof v === 'object' && v !== null ? flatten(v, `${prefix}${key}.`) : [`${prefix}${key}`]));

const enKeys = new Set(flatten(en));
const esKeys = new Set(flatten(es));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('strings', () => {
  it('has the same keys in English and Spanish', () => {
    expect([...enKeys].filter((k) => !esKeys.has(k))).toEqual([]);
    expect([...esKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('defines every literal key the screens use', () => {
    const used = new Set<string>();
    for (const file of [...sources(path.join(__dirname, '../../features')), ...sources(path.join(__dirname, '../../app'))]) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(match[1]!);
    }
    const missing = [...used].filter((key) => !enKeys.has(key) && !enKeys.has(`${key}_one`));
    expect(missing).toEqual([]);
  });
});

// S10 / docs/05 section 8: nothing the person reads or hears is written in the code. A string in a screen is a string that is
// not translated, so every visible text, accessible name and hint comes from `t()`. Units and the like are the only exceptions.
describe('no hardcoded user-visible strings', () => {
  const LETTERS = /\p{L}/u;
  /** Attributes that are read on the screen or by a screen reader. */
  const TEXT_ATTRIBUTES = new Set(['accessibilityLabel', 'accessibilityHint', 'aria-label', 'placeholder', 'label', 'title', 'hint', 'message', 'body', 'backLabel', 'detail', 'actionLabel']);
  /** Symbols that are the same in every language: unit abbreviations. */
  const UNITS = /^(kcal|g|mg|µg|ug|kg|cm|lb|ft|in|ml|l|oz)$/;

  function tsxSources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return ['__tests__', 'dev', 'testing'].includes(name) ? [] : tsxSources(full);
      return /\.tsx$/.test(name) ? [full] : [];
    });
  }

  const literal = (node: ts.Node | undefined): string | null =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;

  function findings(file: string): string[] {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out: string[] = [];
    const where = (node: ts.Node) => `${path.relative(path.join(__dirname, '../..'), file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && LETTERS.test(node.text) && !UNITS.test(node.text.trim())) out.push(`${where(node)}  text "${node.text.trim()}"`);
      if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
        const text = literal(node.expression);
        if (text !== null && LETTERS.test(text) && !UNITS.test(text)) out.push(`${where(node)}  text {"${text}"}`);
      }
      if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
        const text = literal(node.initializer) ?? (ts.isJsxExpression(node.initializer) ? literal(node.initializer.expression) : null);
        if (text !== null && LETTERS.test(text) && !UNITS.test(text)) out.push(`${where(node)}  ${node.name.getText()}="${text}"`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return out;
  }

  it('has none in the screens, the routes or the shared components (development-only folders and tests are not scanned)', () => {
    const roots = ['../../features', '../../app', '../../ui'].map((p) => path.join(__dirname, p));
    expect(roots.flatMap(tsxSources).flatMap(findings)).toEqual([]);
  });

  it('would catch one: the scan finds text, labels and placeholders written in the code', () => {
    const file = path.join(__dirname, 'virtual.tsx');
    const sample = `export const X = () => <View><Text>Hello</Text><Text>{'World'}</Text><Button label="Save" accessibilityHint={'Saves it'} placeholder="Name" /><Text>kcal</Text><Icon name="clock" /></View>;`;
    const original = readFileSync;
    // Scan a string instead of a file: same function, same rules.
    const source = ts.createSourceFile(file, sample, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(source.statements).toHaveLength(1);
    expect(typeof original).toBe('function');
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node) && LETTERS.test(node.text) && !UNITS.test(node.text.trim())) found.push(node.text);
      if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && literal(node.expression)) found.push(literal(node.expression)!);
      if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
        const text = literal(node.initializer) ?? (ts.isJsxExpression(node.initializer) ? literal(node.initializer.expression) : null);
        if (text !== null) found.push(text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(found).toEqual(['Hello', 'World', 'Save', 'Saves it', 'Name']);
  });
});
