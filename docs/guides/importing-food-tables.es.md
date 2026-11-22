# Importar una tabla de composición de alimentos

Algunas tablas nacionales de composición de alimentos no pueden incluirse en Qbit Nutrition porque sus licencias no lo permiten. Igual puedes
usarlas: **tú descargas la tabla desde su editor y la cargas en tu propio teléfono.** Queda en tu teléfono, aparece en la búsqueda de alimentos
y la puedes quitar cuando quieras. [English version](importing-food-tables.md).

> **Verificado el 2026-11-22** en las páginas de cada editor, enlazadas abajo. Los editores mueven y retiran archivos sin avisar: si un enlace
> de aquí ya no funciona, usa la página del editor y [abre un issue](https://github.com/qbitdevz/qbit-nutrition/issues).

## Lee esto primero

- **Tú descargas el archivo, no la app.** Qbit Nutrition nunca descarga una tabla, no trae ninguna y **no hace ninguna conexión a internet** al
  importar una. El archivo se lee en tu teléfono y nada sobre él se envía a ningún lado.
- **La licencia de la tabla rige para ti.** Cada editor tiene sus propias condiciones. Usa la tabla para ti. **No redistribuyas el archivo** y
  **no compartas una exportación hecha después de importarla**: una exportación personal de tus datos (Ajustes → Datos → Exportar) lleva las
  tablas que importaste, completas, así que ese archivo contiene la tabla. Guarda esa exportación para ti, como copia de seguridad. La app te
  lo recuerda antes de compartirla.
- **No se cambia ni se completa nada.** Los valores se guardan como están en el archivo. La única conversión es la de unidades (por ejemplo kJ a
  kcal, mg a g). «Trazas», «nd», «-», «...» y las celdas vacías significan «sin valor» y se guardan como desconocidos, nunca como cero.
- **Las comidas que ya registraste no cambian** al agregar o quitar una tabla: cada alimento registrado conserva su propia copia de sus valores.

## Qué tablas hay y dónde las ofrece cada editor

Lo que ofrece cada editor decide lo que la app puede hacer. «Preajuste» significa que la app reconoce el formato del archivo y completa las
columnas por ti; sin preajuste relacionas tú las columnas (la importación genérica), que sirve para cualquier planilla o CSV con una columna de
nombre de alimento.

| Tabla | Página del editor | Cómo se publica (comprobado el 2026-11-22) | En la app |
| --- | --- | --- | --- |
| **ARGENFOODS** (Argentina, Universidad Nacional de Luján) | [índice de argenfoods](http://www.unlu.edu.ar/~argenfoods/Tablas/Varios/Indice.htm) | Un archivo Excel (`.xls`) y un PDF por grupo de alimentos: 12 archivos Excel en total (cereales, vegetales, frutas, grasas y aceites, pescados y mariscos, carnes, leche, huevos, productos azucarados, misceláneos; pescados y carnes tienen además un archivo de ácidos grasos). El sitio es `http` simple. | **Preajuste.** Descarga el `.xls` de cada grupo que quieras; elige todos los archivos a la vez y se importan como una sola tabla «ARGENFOODS» (o una tabla por archivo, llamada «ARGENFOODS · grupo»). Los archivos de ácidos grasos traen ácidos grasos individuales que la app no registra, así que tienen poco para importar. |
| **BEDCA** (España, AESAN) | [bedca.net/bdpub](https://www.bedca.net/bdpub/) | Solo una consulta web («Consulta»); sin descarga. Todos los derechos reservados. | Sin preajuste. No hay nada que descargar: la importación genérica sirve solo si la AESAN te da una planilla. |
| **México, INCMNSZ** (Tabla de Composición de Alimentos y Productos Alimenticios Mexicanos) | [incmnsz.mx](https://www.incmnsz.mx/) | INFOODS la lista como un PDF en `incmnsz.mx/2019/TABLAS_ALIMENTOS.pdf`; esa dirección respondió «no encontrado» el día de la comprobación. Sin planilla. | Sin preajuste. Pide al INCMNSZ una versión en planilla y usa la importación genérica. |
| **Colombia, TCAC** (ICBF, Tabla de Composición de Alimentos Colombianos) | [ICBF, TCAC 2018](https://www.icbf.gov.co/tabla-de-composicion-de-alimentos-colombianos-tcac-2018) | Solo un PDF (2018; la edición 2015 también es PDF). Sin planilla. | Sin preajuste. Pide al ICBF una versión en planilla y usa la importación genérica. |
| **Lista LATINFOODS** (el directorio de la red regional) | [FAO INFOODS, América Latina](https://www.fao.org/infoods/infoods/tables-and-databases/latin-america/en/) | Un directorio, no un conjunto de datos. Apunta a la publicación de cada país: sobre todo PDF (Chile, Perú, Ecuador, Costa Rica, Uruguay, Centroamérica, la TACO de Brasil), una base de datos web (la TBCA de Brasil), un CD (Cuba) o solo impreso (Bolivia). La entrada de Argentina son las planillas de ARGENFOODS de arriba. | Sin preajuste. Para la tabla de cualquier país: si su editor te da una planilla, usa la importación genérica; la app no lee PDF ni páginas web. |
| **CIQUAL** (Francia, ANSES) | [ciqual.anses.fr](https://ciqual.anses.fr/) | Un archivo Excel (`.xls`, ediciones en francés y en inglés) y XML. Licencia Abierta (Licence Ouverte), según figura en data.gouv.fr. El sitio del editor estaba en mantenimiento (HTTP 503) el día de la comprobación, así que no se pudieron abrir los archivos. | **Preajuste** (hecho a partir del formato de ediciones anteriores y **no comprobado con el archivo actual**). Si no se reconoce, la importación genérica lee las mismas etiquetas. |

Si una tabla se publica solo como PDF o página web, la app no intenta leerla: un lector para eso sería frágil y podría leer mal los números sin
avisar. Busca la versión en planilla del editor. Si copias tú una tabla de un PDF a una planilla, compárala con el PDF antes de confiar en ella.

## Pasos en la app

1. Descarga el archivo (o todos los archivos de una tabla publicada por partes) desde la página del editor de arriba, en tu teléfono (o pásalos a él).
2. Abre **Ajustes → Datos → Tablas importadas → Agregar una tabla**. Lee el aviso, luego **Elegir archivos** y elige un archivo **o varios a la vez**.
   La app lee archivos `.xlsx`, `.xls` y `.csv` de hasta 25 MB cada uno; un archivo más grande o ilegible aparece en la lista con el motivo, y no se
   importa nada de él.
3. **Revisa todo en una sola vista previa.** Los archivos se leen uno tras otro y ves una tarjeta por archivo:
   - **Qué se reconoció, en una línea**, por ejemplo «Formato ARGENFOODS reconocido: 11 nutrientes, valores por 100 g». Cuando la app está segura,
     eso es todo: la pantalla de columnas es opcional (**Cambiar columnas**).
   - **Qué confirmar, cuando no está segura.** La vista previa dice exactamente qué punto es débil y espera tu confirmación: una columna reconocida solo
     por una abreviatura («Prot», «CHO», «Na»), una unidad que el encabezado no indica, valores por 100 ml (se usan como por 100 g), una base que la
     tabla no indica, una columna de nombres encontrada por su contenido, muchos alimentos cuya energía no encaja con sus macros, o muchas filas
     excluidas por valores imposibles. Un archivo con un punto sin confirmar no se importa; confírmalo o desmarca el archivo.
   - **Una tabla que ya está aquí.** Si un archivo tiene el mismo contenido que una tabla que ya importaste, eliges: **Reemplazarla** (la tabla anterior
     se va con sus favoritos y recientes; las comidas que registraste conservan sus valores), **Conservar ambas** o **No importar**. Nada se importa dos
     veces a menos que lo elijas.
   - **Archivos que son partes de una misma tabla** (el mismo formato reconocido, por ejemplo ARGENFOODS) se ofrecen como **una sola tabla**, con su
     nombre, o como una tabla por archivo. Como una sola tabla, quitarla después quita todos los archivos a la vez.
   - **Un archivo sin nada que la app pueda usar** (por ejemplo una hoja solo de ácidos grasos) aparece como tal, no como un error.
   - Desmarca un archivo para dejarlo fuera. **Cambiar columnas** abre la pantalla de columnas de un archivo: el nombre del alimento, un grupo de
     alimentos opcional, a qué se refieren los valores (100 g, 100 ml o 1 kg; «por porción» y similares no se pueden importar) y cada nutriente con la
     unidad en que está escrita su columna.
4. **Importar.** Cada tabla se guarda todo o nada, una tras otra: un archivo que falla no guarda nada de sí mismo y no deshace las tablas ya guardadas.
   El resumen dice exactamente cuáles se importaron (y qué reemplazaron), cuáles fallaron y cuáles se dejaron fuera y por qué. Busca un alimento: los de
   tu tabla llevan la etiqueta. Se pueden registrar, marcar con estrella y el escaneo con IA los puede relacionar como a cualquier alimento.
5. Para quitar una tabla, ve a **Tablas importadas** y elige **Quitar**. Se van todos sus alimentos a la vez; tus comidas registradas conservan sus valores.
6. **Duplicados que ya existen.** Si la misma tabla se importó más de una vez, **Tablas importadas** lo muestra arriba: las copias de cada tabla
   aparecen agrupadas, eliges cuál se queda (la más antigua por defecto) y quitas el resto. Las copias se comparan por contenido, no por nombre.

## Límites

- Las tablas por 100 ml se conservan tal cual y se marcan; la app cuenta las cantidades en gramos, así que ahí 1 ml cuenta como 1 g.
- La vitamina A (y otras vitaminas) en UI se rechaza porque la conversión depende del compuesto; la vitamina D en UI se convierte (40 UI = 1 µg).
- Un valor que ningún alimento puede tener (por ejemplo 5.000 kcal por 100 g) deja fuera su fila y la revisión lo dice; el número nunca se «corrige».
- Hasta 20.000 alimentos por tabla y 30 tablas.
- Un archivo grande puede tardar en leerse en un teléfono antiguo: la app muestra el avance y puedes cancelar.
