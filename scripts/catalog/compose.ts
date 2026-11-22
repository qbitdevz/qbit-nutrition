/**
 * Deterministic composer of Spanish food names from USDA's English descriptions (docs/catalog-sources.md, odd/tasks/catalog-expansion.md T2).
 *
 * A USDA description is a head noun followed by comma-separated qualifiers ("Beef, chuck, ..., cooked, braised"). The composer
 * splits it into segments, looks every word and phrase up in the bilingual glossary (`data/glossary.es.json`), applies the
 * Spanish word order of English noun compounds ("peanut butter sandwich" -> "sándwich de mantequilla de maní") and makes
 * adjectives agree with their noun ("Beans, white, cooked" -> "Frijoles blancos, cocidos"). Nothing is guessed: a word that is
 * not in the glossary is reported in `missing`, and the build refuses to ship a catalog with missing words.
 *
 * Glossary value syntax (`terms` and `phrases`, keys are lowercase English):
 *   `carne de res`   noun, gender inferred from the first word        `f:sal`    noun with explicit gender (m or f)
 *   `fp:papas fritas` noun that is always plural (`mp:` likewise)
 *   `blanc@`         adjective, '@' becomes o/a/os/as; attaches to the head noun ("Arroz blanco")
 *   `a:natural`      adjective without '@': only the number agrees
 *   `q:cocid@`       qualifier with agreement, set off by a comma ("Arroz, cocido")
 *   `x:sin sal`      fixed text, set off by a comma           `p:con`   connector between noun phrases
 */

export type Gender = 'm' | 'f';
type Kind = 'N' | 'A' | 'Q' | 'X' | 'P';

export interface Term {
  kind: Kind;
  es: string;
  gender: Gender;
  /** A noun that is plural whatever the English form ("fp:papas fritas"). */
  fixedPlural: boolean;
  /** Alternative text in a context, from `|poultry=pierna entera` after the value: used when the description is about poultry. */
  alt?: { poultry?: string };
}

export interface GlossaryFile {
  terms: Record<string, string>;
  phrases?: Record<string, string>;
  /** Proper nouns and brand names kept exactly as USDA writes them (case-insensitive match). */
  keep?: string[];
  /** Place and variety names ("Vienna", "Hopi") that stay as written but do not make their segment a brand title. */
  proper?: string[];
}

export interface Glossary {
  terms: Map<string, Term>;
  phrases: Map<string, Term>;
  keep: Set<string>;
  proper: Set<string>;
  maxPhraseWords: number;
}

export interface ComposeResult {
  name: string;
  /** English words that have no glossary entry. Empty for a complete name. */
  missing: string[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Glossary

const F_WORDS = new Set([
  'leche', 'carne', 'sal', 'miel', 'nuez', 'col', 'coliflor', 'flor', 'sangre', 'base', 'imitación', 'pimienta', 'mayonesa',
  'sidra', 'bebida', 'harina', 'grasa', 'cáscara', 'piel', 'clase', 'receta', 'mezcla', 'salsa', 'sopa', 'crema', 'torta',
  'tortilla', 'pasta', 'pizza', 'ensalada', 'galleta', 'fruta', 'verdura', 'semilla', 'cerveza', 'gaseosa', 'agua', 'mano',
  'yema', 'clara', 'pechuga', 'pierna', 'costilla', 'cadera', 'paleta', 'lengua', 'cabeza', 'cola', 'ubre', 'hoja', 'raíz',
  'flor', 'especia', 'hierba', 'alga', 'baya', 'uva', 'pera', 'manzana', 'naranja', 'fresa', 'cereza', 'ciruela',
]);
const M_WORDS = new Set(['día', 'mapa', 'té', 'café', 'tomate', 'aguacate', 'cacahuate', 'aceite', 'jugo', 'zumo', 'pan', 'maíz', 'arroz', 'curry', 'whisky', 'caramelo', 'postre', 'pie', 'yogur', 'puré', 'licor', 'sabor']);

export function inferGender(es: string): Gender {
  const first = (es.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (M_WORDS.has(first)) return 'm';
  if (F_WORDS.has(first)) return 'f';
  if (/(a|ión|dad|tad|tud|umbre)$/.test(first)) return 'f';
  return 'm';
}

export function parseTerm(value: string): Term {
  const bar = value.indexOf('|');
  if (bar >= 0) {
    const base = parseTerm(value.slice(0, bar));
    const m = /^poultry=(.*)$/.exec(value.slice(bar + 1));
    return m ? { ...base, alt: { poultry: m[1] as string } } : base;
  }
  const m = /^(mp|fp|m|f|a|q|x|p):([\s\S]*)$/.exec(value);
  const tag = m?.[1];
  const es = (m ? m[2] : value) as string;
  if (tag === 'a') return { kind: 'A', es, gender: 'm', fixedPlural: false };
  if (tag === 'q') return { kind: 'Q', es, gender: 'm', fixedPlural: false };
  if (tag === 'x') return { kind: 'X', es, gender: 'm', fixedPlural: false };
  if (tag === 'p') return { kind: 'P', es, gender: 'm', fixedPlural: false };
  if (tag === 'm' || tag === 'f' || tag === 'mp' || tag === 'fp') {
    return { kind: 'N', es, gender: tag[0] as Gender, fixedPlural: tag.length === 2 };
  }
  if (es.includes('@')) return { kind: 'A', es, gender: 'm', fixedPlural: false };
  return { kind: 'N', es, gender: inferGender(es), fixedPlural: false };
}

export function buildGlossary(files: readonly GlossaryFile[]): Glossary {
  const terms = new Map<string, Term>();
  const phrases = new Map<string, Term>();
  const keep = new Set<string>();
  const proper = new Set<string>();
  let maxPhraseWords = 1;
  for (const file of files) {
    for (const [k, v] of Object.entries(file.terms)) {
      const key = k.toLowerCase();
      // A multi-word key is a phrase, wherever it is written.
      if (/\s/.test(key)) {
        phrases.set(key, parseTerm(v));
        maxPhraseWords = Math.max(maxPhraseWords, key.split(/[\s,]+/).length);
      } else terms.set(key, parseTerm(v));
    }
    for (const [k, v] of Object.entries(file.phrases ?? {})) {
      const key = k.toLowerCase();
      phrases.set(key, parseTerm(v));
      maxPhraseWords = Math.max(maxPhraseWords, key.split(/[\s,]+/).length);
    }
    for (const k of file.keep ?? []) keep.add(k.toLowerCase());
    for (const k of file.proper ?? []) proper.add(k.toLowerCase());
  }
  return { terms, phrases, keep, proper, maxPhraseWords };
}

// ---------------------------------------------------------------------------------------------------------------------
// Spanish morphology

const ACCENT_DROP: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

/** Plural of one Spanish word (nouns and adjectives of the glossary). */
export function pluralizeWord(w: string): string {
  if (w === '' || /^[\d%"/.,-]+$/.test(w)) return w;
  const last = w[w.length - 1] as string;
  if ('aeiouáéó'.includes(last)) return `${w}s`;
  if (last === 'í' || last === 'ú') return `${w}s`;
  if (last === 'z') return `${w.slice(0, -1)}ces`;
  if (last === 's') {
    const m = /^(.*)([áéíóú])s$/.exec(w);
    if (m) return `${m[1]}${ACCENT_DROP[m[2] as string]}ses`;
    return w; // "lunes", "crisis": already the same in the plural
  }
  const accented = /^(.*)([áéíóú])([nl])$/.exec(w);
  if (accented) return `${accented[1]}${ACCENT_DROP[accented[2] as string]}${accented[3]}es`;
  if (last === 'x') return w;
  if ('kcptbgmfh'.includes(last)) return `${w}s`; // anglicisms: "snack" -> "snacks", "chip" -> "chips"
  return `${w}es`;
}

function flex(word: string, g: Gender, plural: boolean): string {
  if (!word.includes('@')) return word;
  return word.replace('@', plural ? (g === 'm' ? 'os' : 'as') : g === 'm' ? 'o' : 'a');
}

/** An adjective or qualifier in agreement with a noun of the given gender and number. */
const INVARIABLE_O = new Set(['como', 'poco', 'luego', 'pronto', 'cuando', 'tanto', 'mucho', 'solo', 'cero', 'ultra', 'macho']);

/** Adjectives in -és/-án ("japonés", "alemán"): feminine in -esa/-ana, plural in -es/-as. */
function flexAccented(w: string, g: Gender, plural: boolean): string {
  const stem = w.replace(/és$/, 'es').replace(/án$/, 'an');
  if (g === 'f') return plural ? `${stem}as` : `${stem}a`.replace(/esa$/, 'esa');
  return plural ? `${stem}es`.replace(/anes$/, 'anes') : w;
}

export function agree(es: string, g: Gender, plural: boolean): string {
  if (es.includes('@')) return es.split(' ').map((w) => flex(w, g, plural)).join(' ');
  // No '@': a word in -o is an ordinary adjective ("alcohólico") and agrees; others ("natural") only take the plural.
  return es
    .split(' ')
    .map((w) => (/^[a-z]+(és|án)$/.test(w) ? flexAccented(w, g, plural) : /^[a-záéíóúñ]+o$/.test(w) && !INVARIABLE_O.has(w) ? flex(`${w.slice(0, -1)}@`, g, plural) : plural && !/\s/.test(es) ? pluralizeWord(w) : w))
    .join(' ');
}

const NOUN_PHRASE_STOP = new Set(['de', 'del', 'a', 'al', 'con', 'sin', 'en', 'para', 'por', 'y', 'o', 'tipo']);

/**
 * A noun phrase in the plural: every word up to the first preposition ("plátano macho" -> "plátanos machos",
 * "carne de res" -> "carnes de res"). A word marked with a trailing '=' is an apposition that stays ("queso crema=").
 */
function pluralizeNoun(es: string, g: Gender): string {
  const words = es.split(' ');
  let stopped = false;
  return words
    .map((w, i) => {
      if (NOUN_PHRASE_STOP.has(w)) stopped = true;
      if (stopped) return flex(w, g, true);
      if (w.includes('@')) return flex(w, g, true);
      if (w.endsWith('=')) return w;
      return i === 0 || /^[a-záéíóúñ]+$/.test(w) ? pluralizeWord(w) : w;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokens

interface Tok {
  text: string;
  kind: 'word' | 'num' | 'sym' | 'group';
}

const TOKEN = /\u0001(\d+)\u0001|\d+(?:[.,/]\d+)*%?"?|[\p{L}][\p{L}\p{N}]*(?:['’&-][\p{L}\p{N}]+)*\.?|\S/gu;

function tokenize(segment: string): Tok[] {
  const out: Tok[] = [];
  for (const m of segment.matchAll(TOKEN)) {
    const t = m[0];
    if (t.startsWith('\u0001')) out.push({ text: t, kind: 'group' });
    else if (/^\d/.test(t)) out.push({ text: t, kind: 'num' });
    else if (/^\p{L}/u.test(t)) out.push({ text: t, kind: 'word' });
    else out.push({ text: t, kind: 'sym' });
  }
  return out;
}

/** Top-level commas split segments; commas inside parentheses do not. Parenthesized groups are returned apart. */
export function splitDescription(description: string): { segments: string[]; groups: string[] } {
  const groups: string[] = [];
  let depth = 0;
  let start = 0;
  let current = '';
  const segments: string[] = [];
  let inner = '';
  for (let i = 0; i < description.length; i++) {
    const c = description[i] as string;
    if (c === '(') {
      if (depth === 0) inner = '';
      else inner += c;
      depth++;
    } else if (c === ')' && depth > 0) {
      depth--;
      if (depth === 0) {
        groups.push(inner);
        current += `\u0001${groups.length - 1}\u0001`;
      } else inner += c;
    } else if (depth > 0) {
      inner += c;
    } else if (c === ',' || c === ';') {
      segments.push(current.trim());
      current = '';
      start = i + 1;
    } else current += c;
  }
  if (depth > 0) current += `(${inner}`; // unbalanced: keep the text, translate it as plain words
  segments.push(current.trim());
  void start;
  return { segments: segments.filter((s) => s !== ''), groups };
}

// ---------------------------------------------------------------------------------------------------------------------
// Items and rendering

interface Item {
  kind: Kind | 'LIT';
  text: string;
  gender: Gender;
  plural: boolean;
  /** A brand or proper name kept as written: its segment keeps the source word order. */
  brand?: boolean;
}

const lit = (text: string, brand = false): Item => ({ kind: 'LIT', text, gender: 'm', plural: false, brand });

function singularCandidates(w: string): string[] {
  const out: string[] = [];
  if (w.endsWith('ies') && w.length > 4) out.push(`${w.slice(0, -3)}y`);
  if (/(?:ch|sh|x|s|z|o)es$/.test(w) && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith('ves') && w.length > 4) out.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) out.push(w.slice(0, -1));
  return out;
}

/** Whole-segment patterns with numbers in them; the value syntax is the glossary's. */
const PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^trimmed to (\d+(?:\/\d+)?)" fat$/i, (m) => `q:recortad@ a ${m[1]} pulg. de grasa`],
];

function matchPattern(segment: string): Item | null {
  for (const [re, make] of PATTERNS) {
    const m = re.exec(segment.trim());
    if (m) {
      const t = parseTerm(make(m));
      return { kind: t.kind, text: t.es, gender: t.gender, plural: false };
    }
  }
  return null;
}

/** Heads that take their first noun segment with "de" ("Sopa" + "carne de res" = "Sopa de carne de res"). */
const DE_HEADS = new Set(['sopa', 'sopas', 'ensalada', 'ensaladas', 'salsa', 'salsas', 'jugo', 'jugos', 'aceite', 'aceites', 'helado', 'helados', 'pastel', 'pasteles', 'tarta', 'tartas', 'aderezo', 'aderezos', 'mermelada', 'mermeladas', 'jarabe', 'jarabes', 'vinagre', 'harina', 'harinas', 'caldo', 'galleta', 'galletas', 'barra', 'barras', 'panqueque', 'panqueques', 'pan', 'panes', 'tortilla', 'tortillas', 'pizza', 'pizzas', 'budín', 'budines', 'cereal', 'cereales', 'estofado', 'estofados', 'chile', 'dip', 'rollo', 'rollos']);
/** Heads that take a following name as an apposition ("Queso cheddar"). */
const APPOSITION_HEADS = new Set(['queso', 'quesos']);

const CAPS_THAT_TRANSLATE = new Set(['nfs', 'ns']);
const ALLCAPS = /^[A-Z][A-Z0-9'’&.-]*$/;

class Composer {
  readonly missing = new Set<string>();
  constructor(private readonly g: Glossary) {}

  /** The description is about poultry: "leg" then means the whole leg ("pierna entera"), distinct from drumstick and thigh. */
  poultry = false;

  private itemOf(term: Term, plural: boolean): Item {
    const text = this.poultry && term.alt?.poultry ? term.alt.poultry : term.es;
    return { kind: term.kind, text, gender: term.gender, plural: term.fixedPlural || plural };
  }

  /** One word token -> item, or null when the glossary has nothing for it. */
  private lookupWord(raw: string): Item | null {
    const w = raw.toLowerCase();
    // ALL-CAPS words are brand and restaurant names ("OLIVE GARDEN"): kept as written, except the few that are words.
    if (ALLCAPS.test(raw) && raw.length >= 2 && !CAPS_THAT_TRANSLATE.has(w)) return lit(raw, true);
    const direct = this.g.terms.get(w) ?? this.g.terms.get(w.replace(/\.$/, ''));
    if (direct) return this.itemOf(direct, false);
    for (const s of singularCandidates(w)) {
      const hit = this.g.terms.get(s);
      if (hit && (hit.kind === 'N' || hit.kind === 'A' || hit.kind === 'Q')) return this.itemOf(hit, hit.kind === 'N');
    }
    if (this.g.keep.has(w.replace(/\.$/, ''))) return lit(raw, true);
    if (this.g.proper.has(w.replace(/\.$/, ''))) return lit(raw, false);
    if (ALLCAPS.test(raw)) return lit(raw, true);
    // "fruit-flavored" -> "sabor a fruta", after the noun.
    const flavored = /^(\p{L}+)-flavou?red$/iu.exec(raw);
    if (flavored) {
      const base = this.lookupWord(flavored[1] as string);
      if (base && (base.kind === 'N' || base.kind === 'LIT')) return { kind: 'X', text: `sabor a ${base.text}`, gender: 'm', plural: false };
    }
    // A hyphenated word nobody listed: translate its parts, in order, as separate words.
    if (/^\p{L}+(?:-\p{L}+)+$/u.test(raw)) {
      const parts = raw.split('-').map((p) => this.lookupWord(p));
      if (parts.every((p): p is Item => p !== null)) return lit(parts.map((p) => p.text.replace('@', 'o')).join(' '));
    }
    return null;
  }

  /**
   * A segment with a brand or product title ("Udi's plain bread roll", "3 MUSKETEERS Bar (without salt)"): capitalized and
   * ALL-CAPS words, numbers and punctuation stay as written, and each run of lowercase generic words is translated.
   */
  brandSegment(text: string, groups: string[], ctx: Ctx): string {
    const out: string[] = [];
    let run: Tok[] = [];
    const flush = () => {
      if (run.length === 0) return;
      out.push(this.renderSegment(this.resolve(run, groups, ctx), ctx).text);
      run = [];
    };
    for (const t of tokenize(text)) {
      if (t.kind === 'word' && /^[\p{Ll}]/u.test(t.text) && !this.g.keep.has(t.text.toLowerCase())) run.push(t);
      else {
        flush();
        if (t.kind === 'group') {
          const idx = Number(/\d+/.exec(t.text)?.[0]);
          out.push(`(${this.brandSegment(groups[idx] ?? '', [], ctx)})`);
        } else out.push(t.text);
      }
    }
    flush();
    return out.join(' ').replace(/\s+([,;)])/g, '$1').replace(/\(\s+/g, '(');
  }

  /** True when a text holds a brand or restaurant name: an ALL-CAPS word (not an abbreviation) or a listed brand. */
  hasBrand(text: string): boolean {
    return tokenize(text).some((t) => {
      if (t.kind !== 'word') return false;
      const w = t.text.toLowerCase().replace(/\.$/, '');
      return this.g.keep.has(w) || (ALLCAPS.test(t.text) && t.text.length >= 2 && !NOT_BRAND_CAPS.has(w));
    });
  }

  /**
   * "Squash, summer, zucchini, includes skin": when the first segment is a USDA group word, the specific food leads
   * ("zucchini, includes skin") and the group and its modifiers are dropped. Brand segments are never dropped.
   */
  promoteSpecific(segments: string[], groups: string[], ctx: Ctx): string[] {
    if (segments.length < 2 || !GROUP_HEADS.has((segments[0] as string).toLowerCase())) return segments;
    // A glossary phrase that names the whole chain ("squash, spaghetti") wins over promotion.
    for (let k = Math.min(3, segments.length); k >= 2; k--) if (this.g.phrases.has(segments.slice(0, k).join(', ').toLowerCase())) return segments;
    for (let j = 1; j <= Math.min(3, segments.length - 1); j++) {
      const seg = segments[j] as string;
      if (this.hasBrand(seg)) return segments;
      const kinds = new Set(this.resolve(tokenize(seg), groups, ctx).map((i) => i.kind));
      if (kinds.has('N')) return segments.slice(j);
      if (!(kinds.size > 0 && [...kinds].every((k) => k === 'X' || k === 'A'))) return segments;
    }
    return segments; // no specific food follows: the group word stays ("Calabaza de verano, amarilla")
  }

  /** Tokens of one segment -> items, matching the longest glossary phrase first. */
  private resolve(toks: Tok[], groups: string[], ctx: Ctx): Item[] {
    const items: Item[] = [];
    for (let i = 0; i < toks.length; ) {
      const t = toks[i] as Tok;
      if (t.kind === 'group') {
        const idx = Number(/\d+/.exec(t.text)?.[0]);
        const inner = splitDescription(groups[idx] ?? '');
        // A parenthesized brand or product title ("(Clif Bar)") stays as written.
        const brand = this.hasBrand(groups[idx] ?? '');
        items.push(lit(brand ? `(${this.brandSegment(groups[idx] ?? '', [], ctx)})` : `(${this.composeList(inner.segments, inner.groups, ctx)})`, brand));
        i++;
        continue;
      }
      if (t.kind === 'num') {
        items.push(lit(t.text));
        i++;
        continue;
      }
      if (t.kind === 'sym') {
        items.push(t.text === '&' ? { kind: 'P', text: 'y', gender: 'm', plural: false } : t.text === '/' || t.text === '+' ? { kind: 'P', text: t.text, gender: 'm', plural: false } : lit(t.text));
        i++;
        continue;
      }
      // Longest phrase starting here (words only).
      let hit: { term: Term; len: number; plural: boolean } | null = null;
      for (let len = Math.min(this.g.maxPhraseWords, toks.length - i); len >= 2 && !hit; len--) {
        const slice = toks.slice(i, i + len);
        if (slice.some((s) => s.kind !== 'word')) continue;
        const key = slice.map((s) => s.text.toLowerCase()).join(' ');
        const exact = this.g.phrases.get(key);
        const singular = exact ? undefined : this.g.phrases.get(this.singularPhrase(key));
        const term = exact ?? singular;
        if (term) hit = { term, len, plural: !exact && term.kind === 'N' };
      }
      if (hit) {
        items.push(this.itemOf(hit.term, hit.plural));
        i += hit.len;
        continue;
      }
      const item = this.lookupWord(t.text);
      if (item) items.push(item);
      else {
        this.missing.add(t.text.toLowerCase());
        items.push(lit(t.text));
      }
      i++;
    }
    return items;
  }

  private singularPhrase(key: string): string {
    const words = key.split(' ');
    const last = words[words.length - 1] as string;
    const cand = singularCandidates(last)[0];
    return cand ? [...words.slice(0, -1), cand].join(' ') : key;
  }

  private inflectNoun(item: Item): string {
    return item.plural && item.kind === 'N' ? pluralizeNoun(item.text, item.gender) : flex(item.text, item.gender, false);
  }

  /** A run of items without connectors: modifiers, adjectives and at most one head noun. */
  private renderChunk(items: Item[], ctx: Ctx): { text: string; head: Item | null } {
    if (items.some((it) => it.brand)) {
      // A brand or product name: translate word by word and keep the source order.
      const text = items
        .map((it) => (it.kind === 'N' ? this.inflectNoun(it) : it.kind === 'A' || it.kind === 'Q' ? agree(it.text, ctx.gender, ctx.plural) : it.text))
        .join(' ');
      return { text, head: null };
    }
    let h = -1;
    items.forEach((it, i) => {
      if (it.kind === 'N') h = i;
    });
    if (h < 0) {
      const text = items
        .map((it) => (it.kind === 'A' || it.kind === 'Q' ? agree(it.text, ctx.gender, ctx.plural) : it.text))
        .join(' ');
      return { text, head: null };
    }
    const head = items[h] as Item;
    let lead = 0;
    while (lead < h && (items[lead] as Item).kind === 'LIT') lead++;
    let adjStart = h;
    while (adjStart > lead && ['A', 'Q', 'X'].includes((items[adjStart - 1] as Item).kind)) adjStart--;
    const modifiers = items.slice(lead, adjStart);
    const parts: string[] = items.slice(0, lead).map((it) => it.text);
    parts.push(this.inflectNoun(head));
    for (const adj of items.slice(adjStart, h)) parts.push(adj.kind === 'X' ? adj.text : agree(adj.text, head.gender, head.plural));
    for (const tail of items.slice(h + 1)) parts.push(tail.kind === 'A' || tail.kind === 'Q' ? agree(tail.text, head.gender, head.plural) : tail.text);
    if (modifiers.length > 0) {
      const mod = this.renderChunk(modifiers, { gender: head.gender, plural: false }).text;
      // "ensalada" + "ensalada de col de brócoli": the modifier already names the head.
      if (foldText(mod).startsWith(`${foldText(this.inflectNoun(head))} `)) return { text: [...parts.slice(0, lead), mod].join(' '), head };
      parts.push('de', mod);
    }
    return { text: parts.join(' ').replace(/\bde el\b/g, 'del'), head };
  }

  /** One comma segment -> text, its head noun (if any) and whether it is made of attachable adjectives only. */
  private renderSegment(items: Item[], ctx: Ctx): { text: string; head: Item | null; kinds: Set<string> } {
    const kinds = new Set(items.map((i) => i.kind));
    const chunks: string[] = [];
    let run: Item[] = [];
    let head: Item | null = null;
    const flush = () => {
      if (run.length === 0) return;
      const r = this.renderChunk(run, head ? { gender: head.gender, plural: head.plural } : ctx);
      head ??= r.head;
      chunks.push(r.text);
      run = [];
    };
    for (const it of items) {
      if (it.kind === 'P') {
        flush();
        chunks.push(it.text);
      } else run.push(it);
    }
    flush();
    return { text: chunks.join(' '), head, kinds };
  }

  composeList(segments: string[], groups: string[], ctx: Ctx): string {
    const fragments: { text: string; attachable: boolean }[] = [];
    let context = ctx;
    let chainOpen = true;
    let headWord = '';
    let ctxSet = false;
    let headIsBrand = false;
    for (let i = 0; i < segments.length; ) {
      // Longest run of whole segments that is a glossary phrase ("cheese, cottage").
      let consumed = 0;
      let phraseItem: Item | null = null;
      for (let k = Math.min(4, segments.length - i); k >= 1 && !phraseItem; k--) {
        const key = segments.slice(i, i + k).join(', ').toLowerCase();
        const term = k >= 2 ? this.g.phrases.get(key) : undefined;
        if (term) {
          phraseItem = this.itemOf(term, false);
          consumed = k;
        }
      }
      let items: Item[];
      if (phraseItem) items = [phraseItem];
      else {
        consumed = 1;
        const restored = (segments[i] as string).replace(/\u0001(\d+)\u0001/g, (_m, n: string) => `(${groups[Number(n)] ?? ''})`);
        const pattern = matchPattern(segments[i] as string);
        const side = /^(.+) (off|on)$/i.exec(segments[i] as string);
        const notSpecified = /^NS as to (.+)$/i.exec(segments[i] as string);
        if (pattern) items = [pattern];
        else if (this.hasBrand(segments[i] as string)) items = [lit(this.brandSegment(segments[i] as string, groups, context), true)]; // brand and product title: as written
        else if (notSpecified) {
          // FNDDS "NS as to fat type" = not specified as to ...: "tipo de grasa sin especificar"
          items = [{ kind: 'X', text: 'sin especificar', gender: 'm', plural: false }, ...this.resolve(tokenize(notSpecified[1] as string), groups, context)];
        }
        else if (side) {
          // "trotter off" -> "sin pezuña", "heel on" -> "con talón"
          const inner = this.resolve(tokenize(side[1] as string), groups, context);
          items = [{ kind: 'P', text: (side[2] as string).toLowerCase() === 'off' ? 'sin' : 'con', gender: 'm', plural: false }, ...inner];
        } else items = this.resolve(tokenize(segments[i] as string), groups, context);
      }
      const seg = this.renderSegment(items, context);
      if (i === 0) headWord = seg.text.toLowerCase();
      // The number and gender of the first head noun: the description's own, or the first one after a brand title.
      if (!ctxSet && seg.head) {
        context = { gender: seg.head.gender, plural: seg.head.plural };
        ctxSet = true;
      }
      if (i === 0) headIsBrand = items.length === 1 && items[0]?.brand === true;
      const chain = fragments.length === 1 && chainOpen && !headIsBrand;
      const onlyAdjectives = seg.kinds.size > 0 && [...seg.kinds].every((k) => k === 'A');
      // A fixed prepositional phrase right after the head ("Arroz de grano largo", "Sopa con fideos").
      const preposition = seg.kinds.size === 1 && seg.kinds.has('X') && /^(de|del|a base) /.test(seg.text);
      const headText = headWord;
      // A noun segment after a head that takes "de" ("Sopa de carne de res y verduras") or an apposition ("Queso cheddar").
      const nounSegment = i === 0 || fragments.length !== 1 ? false : seg.kinds.has('N') && !seg.kinds.has('P') && !seg.kinds.has('LIT');
      const joiner = nounSegment ? (DE_HEADS.has(headText) ? 'de ' : APPOSITION_HEADS.has(headText) ? '' : null) : '';
      if (nounSegment && fragments.length === 1 && foldText(seg.text) === foldText(fragments[0]?.text ?? '')) {
        i += consumed; // "Sauce, salsa": the segment only repeats the head
        continue;
      }
      if (chain && (onlyAdjectives || preposition || (nounSegment && joiner !== null))) {
        const last = fragments[fragments.length - 1] as { text: string; attachable: boolean };
        const same = nounSegment && foldText(seg.text).startsWith(`${foldText(last.text)} `); // "Pan" + "pan naan"
        last.text = same ? seg.text : `${last.text} ${nounSegment ? joiner : ''}${seg.text}`;
        chainOpen = onlyAdjectives;
        void last;
      } else {
        fragments.push({ text: seg.text, attachable: false });
        if (fragments.length > 1) chainOpen = false;
      }
      i += consumed;
    }
    // A fragment that only repeats what an earlier one already says ("Queso fresco" + "queso fresco") is left out.
    const seen: string[] = [];
    const kept = fragments.filter((f, idx) => {
      const key = foldText(f.text);
      const dup = idx > 0 && key !== '' && seen.some((s) => s.includes(key));
      seen.push(key);
      return !dup;
    });
    return kept.map((f) => f.text).join(', ');
  }
}

const foldText = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** USDA group words: "Fish, salmon", "Nuts, almonds", "Squash, summer, zucchini" are about the second word, not the group. */
const GROUP_HEADS = new Set(['squash', 'nuts', 'seeds', 'fish', 'mollusks', 'crustaceans', 'spices', 'beverages', 'game meat', 'alcoholic beverage']);

/** Abbreviations in ALL CAPS that are not brand names. */
const NOT_BRAND_CAPS = new Set(['nfs', 'ns', 'ara', 'dha', 'usda', 'bbq', 'rte', 'msg', 'upc', 'ph', 'us', 'usa']);

/** Animals and animal products that a meatless product imitates. */
const ANIMAL_HEAD = /^(chicken|beef|pork|turkey|bacon|sausage|frankfurter|hot dog|ham|bologna|burger|hamburger|meatball|fish|tuna|shrimp|lamb|veal|steak|nuggets?|patty|jerky|pepperoni|salami|ribs|crab|lobster|duck|bacon bits)\b/i;
const SUBSTITUTE_WORD = /^(meatless|vegetarian|vegan)$/i;

interface Ctx {
  gender: Gender;
  plural: boolean;
}

const capitalize = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));

/** Composes the Spanish name of one USDA description. */
export function composeSpanish(description: string, glossary: Glossary): ComposeResult {
  const { segments, groups } = splitDescription(description.replace(/\band\/or\b/gi, 'andor').replace(/ -- /g, ', ').replace(/ -(?=[a-z])/g, ' ').replace(/(?<![\d])"/g, ''));
  const composer = new Composer(glossary);
  composer.poultry = /\b(chicken|turkey|duck|goose|hen|hens|capon|capons|poultry|quail|pheasant|broilers?|fryers?)\b/i.test(segments[0] ?? '');
  const ctx0 = { gender: 'm' as Gender, plural: false };
  // "Chicken, meatless": a substitute for the animal product, not the animal.
  const subIdx = segments.findIndex((s, i) => i > 0 && SUBSTITUTE_WORD.test(s.trim()));
  const substitute = subIdx > 0 && ANIMAL_HEAD.test((segments[0] as string).trim());
  const parts = substitute ? segments.filter((_s, i) => i !== subIdx) : segments;
  // A trailing "NFS" (not further specified) says nothing about the food: "Cheese, NFS" is just cheese.
  const trimmed = parts.length > 1 && /^NFS$/.test((parts[parts.length - 1] as string).trim()) ? parts.slice(0, -1) : parts;
  let text = composer.composeList(composer.promoteSpecific(trimmed, groups, ctx0), groups, ctx0);
  if (substitute) text = `Sustituto vegetal de ${text[0]?.toLowerCase() ?? ''}${text.slice(1)}`;
  return {
    name: capitalize(text.replace(/=/g, '').replace(/\s+/g, ' ').replace(/\s+([,;)])/g, '$1').trim()),
    missing: [...composer.missing].sort(),
  };
}
