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
      squash: 'f:calabaza', summer: 'x:de verano', zucchini: 'm:calabacín', nuts: 'fp:nueces', almond: 'f:almendra', fish: 'm:pescado', salmon: 'm:salmón',
      fresh: 'fresc@', 'dry roasted': 'q:tostad@ en seco', 'includes skin': 'x:con piel', meatless: 'a:sin carne', sausage: 'f:salchicha', lamb: 'm:cordero',
      leg: 'f:pierna|poultry=pierna entera', drumstick: 'm:muslito', thigh: 'm:muslo', bar: 'f:barra', gluten: 'm:gluten', 'gluten free': 'a:sin gluten', roll: 'm:panecillo',
      yellow: 'amarill@', drink: 'f:bebida', fruit: 'f:fruta', japanese: 'a:japonés', nut: 'f:castaña', queso: 'm:queso', naan: 'm:pan naan', salsa: 'f:salsa', candies: 'mp:dulces', rolls: 'mp:panecillos', skin: 'f:piel',
    },
    phrases: { 'squash, spaghetti': 'f:calabaza espagueti', 'cheese, cottage': 'm:requesón', 'separable lean only': 'x:solo carne magra separable', 'french fries': 'fp:papas fritas' },
    keep: ["Kellogg's", 'USDA', "Udi's", 'MARS'],
  },
]);

const es = (d: string) => composeSpanish(d, glossary);

describe('Spanish morphology', () => {
  it('agrees adjectives in -és and -án with gender and number ("japonesa", "alemanas")', () => {
    expect(agree('japonés', 'f', false)).toBe('japonesa');
    expect(agree('japonés', 'f', true)).toBe('japonesas');
    expect(agree('japonés', 'm', true)).toBe('japoneses');
    expect(agree('alemán', 'f', true)).toBe('alemanas');
    expect(agree('alemán', 'm', false)).toBe('alemán');
  });

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
    expect(es("KELLOGG'S Rice Cheddar").name).toBe("KELLOGG'S Rice Cheddar"); // a product title is not translated
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
    expect(es('French fries, fried').name).toBe('Papas fritas'); // the repeated "fritas" is dropped
  });

  it('keeps ALL-CAPS names, listed brands and numbers, and translates inside parentheses', () => {
    expect(es("KELLOGG'S, egg").name).toBe("KELLOGG'S, huevo");
    expect(es('Cheese (cooked, raw)').name).toBe('Queso (cocido, crudo)');
  });

  it('reports every English word it could not translate, and leaves it in place', () => {
    expect(es('Rice, zorp, cooked, blorp')).toEqual({ name: 'Arroz, zorp, cocido, blorp', missing: ['blorp', 'zorp'] });
  });

  it('leads with the specific food of a USDA group chain and drops the group word', () => {
    expect(es('Squash, summer, zucchini, includes skin, raw').name).toBe('Calabacín, con piel, crudo');
    expect(es('Nuts, almonds, dry roasted').name).toBe('Almendras, tostadas en seco');
    expect(es('Fish, salmon, raw').name).toBe('Salmón, crudo');
    expect(es('Beef, ground, raw').name).toBe('Carne de res molida, cruda'); // "Beef" is a food, not a group
  });

  it('keeps the group word when no specific food follows it, and when a glossary phrase names the whole chain', () => {
    expect(es('Squash, summer, yellow, raw').name).toBe('Calabaza de verano, amarilla, cruda');
    expect(es('Squash, spaghetti, raw').name).toBe('Calabaza espagueti, cruda');
  });

  it('reads "X-flavored" as "sabor a X", after the noun', () => {
    expect(es('Fruit-flavored drink').name).toBe('Bebida sabor a fruta');
  });

  it('does not repeat a name the description already says', () => {
    expect(es('Cheese, fresh, queso fresco').name).toBe('Queso fresco');
    expect(es('Cheese, cottage, plain, cheese, cottage').name).toBe('Requesón natural');
  });

  it('leaves out a trailing "NFS" (not further specified): the plain food needs no such note', () => {
    expect(es('Cheese, NFS').name).toBe('Queso');
    expect(es('Milk, NFS').name).toBe('Leche');
    expect(es('Rice, NFS, cooked').name).toBe('Arroz, sin especificar, cocido'); // only a trailing one
  });

  it('does not say a head twice when joining a noun segment ("Sauce, salsa", "Bread, naan")', () => {
    expect(es('Sauce, salsa').name).toBe('Salsa');
    expect(es('Bread, naan').name).toBe('Pan naan');
  });

  it('keeps leg, drumstick and thigh apart, and says whole leg for poultry only', () => {
    expect(es('Chicken, leg').name).toBe('Pollo, pierna entera');
    expect(es('Lamb, leg').name).toBe('Cordero, pierna');
    expect(es('Chicken, drumstick').name).toBe('Pollo, muslito');
    expect(es('Chicken, thigh').name).toBe('Pollo, muslo');
    expect(es('Chicken leg, drumstick and thigh').name).toBe('Pierna entera de pollo, muslito y muslo');
  });

  it('names a meatless product as a substitute, not as the animal', () => {
    expect(es('Chicken, meatless').name).toBe('Sustituto vegetal de pollo');
    expect(es('Sausage, meatless, cooked').name).toBe('Sustituto vegetal de salchicha, cocida');
  });

  it('keeps a segment with a brand or product title as written and translates the generic descriptors around it', () => {
    expect(es('Candies, MARS, 3 MUSKETEERS Bar').name).toBe('Dulces, MARS, 3 MUSKETEERS Bar');
    expect(es("Udi's, Gluten Free, Rolls, raw").name).toBe("Udi's, sin gluten, panecillos, crudos");
    expect(es("Sausage, Kellogg's Fat Free Bar").missing).toEqual([]);
  });

  it('inside a brand segment keeps the capitalized product words and translates the lowercase generic ones', () => {
    expect(es("Udi's plain bread roll").name).toBe("Udi's panecillo de pan natural");
    expect(es("MARS, 3 MUSKETEERS Bar (without salt)").name).toBe('MARS, 3 MUSKETEERS Bar (sin sal)');
    expect(es("Kellogg's Fat Free Bar").missing).toEqual([]);
  });

  it('is deterministic and starts with a capital', () => {
    expect(es('egg, raw').name).toBe(es('egg, raw').name);
    expect(es('egg, raw').name).toBe('Huevo, crudo');
  });
});
