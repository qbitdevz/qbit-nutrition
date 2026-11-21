# Aportar comidas para el banco de pruebas: el protocolo de pesaje

La precisión del análisis de fotos **todavía no se ha medido**, y el banco de pruebas necesita comidas de las que se
conozcan los pesos reales. Esta guía explica cómo pesar, fotografiar y describir una comida para que pueda añadirse al
conjunto de datos. [English version](weighing-protocol.md).

La referencia técnica es [`bench/README.md`](../../bench/README.md) (formatos de archivo, métricas, cómo funciona una
ejecución, en inglés) y [`docs/11-qa-and-ai-accuracy.md`](../11-qa-and-ai-accuracy.md) parte B (por qué y cuántas). Esta
página es la versión corta para quienes no son desarrolladores. Al contribuir aceptas que tus fotos y archivos se
publiquen bajo la licencia abierta del proyecto, como indica [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Qué necesitas

- Una báscula de cocina con **resolución de 1 g**.
- La cámara del teléfono y la luz donde comes normalmente. Sin montajes especiales.
- Tus propias comidas y tus propias fotos. **Sin rostros ni datos personales en ninguna foto.**

## Para cada comida

1. **Pesa cada componente** en la báscula, antes de emplatar o mientras emplatas. Si es comida cocinada, pésala
   **cocinada**. Apunta el número de cada alimento (por ejemplo «arroz, cocido: 180 g»).
2. **Fotografía el plato** desde arriba y desde unos 45 grados. Elige la mejor foto para el conjunto de datos (o haz dos
   comidas con ellas). Una foto por comida.
3. **Anota lo que no se ve:** el aceite o la mantequilla usados, las salsas mezcladas, el aderezo. Cuentan para los
   nutrientes reales, pero no se espera que se vean.
4. **Busca el alimento del catálogo** que corresponde a cada elemento (siguiente apartado). Nunca escribes valores
   nutricionales: se calculan a partir del catálogo con el mismo código que usa la aplicación.

Cubre la variedad indicada en `docs/11` B.2: alimentos sueltos, platos separados, platos mixtos (guisos, pasta, arroces),
sándwiches y wraps, ensaladas con aderezo, sopas, desayunos, tentempiés y fruta, bebidas, alimentos envasados, platos de
restaurante y platos regionales de países de habla hispana e inglesa. **Además, unas 20 fotos sin comida** (un teclado, un
escritorio, un plato vacío): miden con qué frecuencia el modelo inventa comida.

## El archivo de la foto

- Un **JPEG**, con el lado largo de **como máximo 1.024 píxeles** y **como máximo 1 MiB**. La herramienta no cambia el
  tamaño de las fotos y rechaza las más grandes con un mensaje que nombra el archivo. Casi todos los teléfonos tienen una
  opción de «cambiar tamaño» al compartir o editar una foto.
- Llámalo `photo.jpg`.

## Buscar el alimento del catálogo

Necesitas el `source_id` (el identificador de USDA FoodData Central) de cada alimento. Construye el catálogo una vez
(`npm run catalog:build`, requiere internet) y búscalo. Con Node 22 o posterior, desde la carpeta del repositorio:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('catalog-build/catalog.db',{readOnly:true});for(const r of db.prepare(\"SELECT f.source_id, n.name FROM food f JOIN food_name n ON n.food_id=f.id WHERE n.locale='en' AND n.name LIKE ? LIMIT 20\").all('%chicken%'))console.log(r.source_id, r.name)"
```

Cambia `chicken` por tu alimento (los nombres están en inglés). Elige la entrada que coincida con cómo lo pesaste (crudo,
cocido, con o sin piel). Los identificadores de los ejemplos de `bench/README.md` son marcadores de posición; toma siempre
los tuyos de tu propia búsqueda.

## La carpeta de la comida

Una carpeta por comida dentro de `bench/data/meals/`, con la fecha y un nombre corto, por ejemplo `2026-01-12-lunch`:

```
bench/data/meals/2026-01-12-lunch/
  photo.jpg
  meal.json
```

`meal.json` para una foto con comida:

```json
{
  "is_food": true,
  "category": "separated_plate",
  "locale": "es",
  "hint": "sin sal",
  "items": [
    { "name": "chicken breast, grilled", "aliases": ["pollo a la plancha"], "grams": 120, "catalog_source_id": "171477" },
    { "name": "white rice, cooked", "aliases": ["arroz blanco"], "grams": 180, "catalog_source_id": "168878" }
  ],
  "hidden_ingredients": [{ "name": "olive oil", "grams": 5, "catalog_source_id": "171413" }]
}
```

`name` es el nombre en inglés del alimento y `aliases` son otros nombres que un modelo podría usar. `category` es una de
`single_food`, `separated_plate`, `mixed_dish`, `sandwich_wrap`, `salad`, `soup`, `breakfast`, `snack_fruit`, `drink`,
`packaged`, `restaurant`, `regional`. `hint` y `locale` (`en` o `es`) son opcionales: son lo que habrías escrito en la
aplicación. Para una foto sin comida, el archivo es solo `{ "is_food": false }`. Las claves mal escritas se rechazan a
propósito, para que un error de escritura falle de forma visible. Las reglas completas están en `bench/README.md`.

## Comprueba tus archivos y envíalos

1. Comprueba la carpeta sin llamar a ningún servicio de IA:
   `npx tsx bench/run.ts --adapter openai_compatible --base-url http://localhost:11434/v1 --model none --offline --out-dir ../bench-check --cache-dir ../bench-check/cache`
   Valida primero cada `meal.json` y cada foto y nombra el archivo que está mal. Con `--offline` no llama a ningún
   servicio de IA, y las dos carpetas mantienen fuera del repositorio lo que escriba (puedes borrarlas).
2. Abre una pull request siguiendo [CONTRIBUTING.md](../../CONTRIBUTING.md) o, si no te sientes cómodo con git, abre una
   [incidencia](https://github.com/qbitdevz/qbit-nutrition/issues) y di que tienes comidas para aportar.
3. Las comidas que no quieras publicar pueden ir en `bench/data/private/` (nunca se suben); se quedan en tu ordenador.
