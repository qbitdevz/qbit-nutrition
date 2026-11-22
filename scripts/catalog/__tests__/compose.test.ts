import { agree, buildGlossary, composeSpanish, inferGender, parseTerm, pluralizeWord, splitDescription } from '../compose';

const glossary = buildGlossary([
  {
    terms: {
      rice: 'arroz', beef: 'f:carne de res', bean: 'm:frijol', apple: 'f:manzana', egg: 'huevo', chicken: 'pollo', breast: 'f:pechuga',
      peanut: 'maní', butter: 'f:mantequilla', sandwich: 'm:sándwich', wheat: 'trigo', bread: 'pan', cheese: 'queso', cheddar: 'cheddar',
      noodle: 'm:fideo', sauce: 'f:salsa', tomato: 'tomate', 'tomato-based': 'x:a base de tomate', onion: 'f:cebolla', ring: 'm:aro',
      meat: 'f:carne', fat: 'f:grasa', salt: 'f:sal', milk: 'f:leche', pie: 'm:pastel', cake: 'f:torta',
      white: 'blanc@', whole: 'enter@', ground: 'molid@', lean: 'magr@', plain: 'a:natural', green: 'a:verde', 'low-fat': 'baj@ en grasa',
      cooked: 'q:cocid@', raw: 'q:crud@', fried: 'q:frit@', baked: 'q:hornead@', boiled: 'q:hervid@', scrambled: 'q:revuelt@',
      with: 'p:con', without: 'p:sin', and: 'p:y', or: 'p:o', from: 'p:de', restaurant: 'm:restaurante', 'long-grain': 'x:de grano largo',
      regular: 'a:regular', 'ready-to-eat': 'x:listo para comer', nfs: 'x:sin especificar', choice: 'x:calidad choice', unenriched: 'q:sin enriquecer',
      oats: 'f:avena', fries: 'fp:papas fritas',
    },
    phrases: { 'cheese, cottage': 'm:requesón', 'separable lean only': 'x:solo carne magra separable', 'french fries': 'fp:papas fritas' },
    keep: ["Kellogg's", 'USDA'],
  },
]);

const es = (d: string) => composeSpanish(d, glossary);

describe('Spanish morphology', () => {
  it('pluralizes nouns and adjectives by their ending', () => {
    expect(['arroz', 'limón', 'pastel', 'frijol', 'manzana', 'maní', 'francés', 'lunes', 'natural', 'verde'].map(pluralizeWord)).toEqual([
      'arroces', 'limones', 'pasteles', 'frijoles', 'manzanas', 'manís', 'franceses', 'lunes', 'naturales', 'verdes',
    ]);
  });

  it('makes adjectives agree with the noun, and invariable ones only in number', () => {
    expect(agree('cocid@', 'f', false)).toBe('cocida');
    expect(agree('cocid@', 'm', true)).toBe('cocidos');
    expect(agree('baj@ en grasa', 'f', true)).toBe('bajas en grasa');
    expect(agree('natural', 'f', true)).toBe('naturales');
    expect(agree('sin sal', 'm', true)).toBe('sin sal');
  });

  it('infers the gender of a noun from its first word, with explicit exceptions', () => {
    expect(['manzana', 'carne de res', 'leche', 'sal', 'arroz', 'aceite', 'porción', 'té', 'mapa'].map(inferGender)).toEqual(['f', 'f', 'f', 'f', 'm', 'm', 'f', 'm', 'm']);
  });

  it('parses the value syntax of the glossary', () => {
    expect(parseTerm('f:sal')).toMatchObject({ kind: 'N', gender: 'f', es: 'sal', fixedPlural: false });
    expect(parseTerm('mp:frijoles')).toMatchObject({ kind: 'N', gender: 'm', fixedPlural: true });
    expect(parseTerm('blanc@')).toMatchObject({ kind: 'A' });
    expect(parseTerm('q:cocid@')).toMatchObject({ kind: 'Q' });
    expect(parseTerm('x:sin sal')).toMatchObject({ kind: 'X' });
    expect(parseTerm('p:con')).toMatchObject({ kind: 'P' });
  });
});

describe('splitDescription', () => {
  it('splits on top-level commas only, keeping parenthesized groups apart', () => {
    expect(splitDescription('Chickpeas (garbanzo beans, bengal gram), cooked')).toEqual({
      segments: ['Chickpeas \u00010\u0001', 'cooked'],
      groups: ['garbanzo beans, bengal gram'],
    });
  });
});

describe('composeSpanish', () => {
  it('puts adjectives after the noun, attaches the first ones, and sets states off with commas', () => {
    expect(es('Rice, white, long-grain, regular, cooked, unenriched, with salt')).toEqual({
      name: 'Arroz blanco de grano largo, regular, cocido, sin enriquecer, con sal',
      missing: [],
    });
  });

  it('attaches a noun segment to heads that take "de" or an apposition, and keeps brand names in source order', () => {
    expect(es('Rice, long-grain').name).toBe('Arroz de grano largo');
    expect(es('Cheese, cheddar').name).toBe('Queso cheddar');
    expect(es('Milk, plain').name).toBe('Leche natural');
    expect(es("KELLOGG'S Rice Cheddar").name).toBe("KELLOGG'S arroz cheddar");
  });

  it('agrees with a plural feminine noun', () => {
    expect(es('Apples, raw').name).toBe('Manzanas, crudas');
    expect(es('Beef, ground, 80% lean meat / 20% fat, raw').name).toBe('Carne de res molida, 80% carne magra / 20% grasa, cruda');
  });

  it('agrees with a plural masculine noun', () => {
    expect(es('Beans, white, cooked').name).toBe('Frijoles blancos, cocidos');
  });

  it('turns English noun compounds into "head de modifier", recursively', () => {
    expect(es('Peanut butter sandwich').name).toBe('Sándwich de mantequilla de maní');
    expect(es('Chicken breast, baked').name).toBe('Pechuga de pollo, horneada');
    expect(es('Whole wheat bread').name).toBe('Pan de trigo entero');
    expect(es('Onion rings, fried').name).toBe('Aros de cebolla, fritos');
  });

  it('joins noun phrases with connectors', () => {
    expect(es('Beef and noodles with tomato-based sauce').name).toBe('Carne de res y fideos con salsa a base de tomate');
    expect(es('Egg, scrambled, or fried, without salt').name).toBe('Huevo, revuelto, o frito, sin sal');
  });

  it('uses whole-segment phrases and patterns', () => {
    expect(es('Cheese, cottage, plain').name).toBe('Requesón natural');
    expect(es('Beef, ground, separable lean only, trimmed to 1/8" fat, choice').name).toBe(
      'Carne de res molida, solo carne magra separable, recortada a 1/8 pulg. de grasa, calidad choice',
    );
  });

  it('keeps plural-only English nouns singular or plural as the glossary says', () => {
    expect(es('Oats, cooked').name).toBe('Avena, cocida');
    expect(es('French fries, fried').name).toBe('Papas fritas, fritas');
  });

  it('keeps ALL-CAPS names, listed brands and numbers, and translates inside parentheses', () => {
    expect(es("KELLOGG'S, egg").name).toBe("KELLOGG'S, huevo");
    expect(es("Kellogg's cheese (USDA, cooked)").name).toBe("Kellogg's queso (USDA, cocido)");
  });

  it('reports every English word it could not translate, and leaves it in place', () => {
    expect(es('Rice, zucchini, cooked, blorp')).toEqual({ name: 'Arroz, zucchini, cocido, blorp', missing: ['blorp', 'zucchini'] });
  });

  it('is deterministic and starts with a capital', () => {
    expect(es('egg, raw').name).toBe(es('egg, raw').name);
    expect(es('egg, raw').name).toBe('Huevo, crudo');
  });
});
