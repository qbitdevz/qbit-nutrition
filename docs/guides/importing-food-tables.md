# Import a food composition table

Some national food tables cannot be bundled in Qbit Nutrition because their licenses do not allow it. You can still use them: **you download the
table yourself from its publisher and load it into your own phone.** It stays on your phone, shows up in food search, and you can remove it at
any time. [Versión en español](importing-food-tables.es.md).

> **Verified on 2026-11-22** on each publisher's own pages, linked below. Publishers move and retire files without notice: if a link here no
> longer works, use the publisher's page and [open an issue](https://github.com/qbitdevz/qbit-nutrition/issues).

## Read this first

- **You download the file, not the app.** Qbit Nutrition never downloads a table, ships none, and makes **no network request** when you import
  one. The file is read on your phone and nothing about it is sent anywhere.
- **The table's license applies to you.** Each publisher has its own terms. Use the table for yourself. **Do not redistribute the file**, and
  **do not share an export made after importing it**: a personal export of your data (Settings → Data → Export) carries the tables you imported,
  in full, so that file contains the table. Keep that export for yourself, as a backup. The app reminds you before you share it.
- **Nothing is changed or filled in.** Values are stored as they are in the file. The only conversion is the unit (for example kJ to kcal,
  mg to g). "Traces", "nd", "-", "..." and empty cells mean "no value" and are stored as unknown, never as zero.
- **Meals you already logged never change** when you add or remove a table: each logged item keeps its own copy of its values.

## Which tables, and where each publisher offers them

What each publisher offers decides what the app can do. "Preset" means the app recognises the layout of the file and fills in the columns for
you; without one you match the columns yourself (the generic import), which works for any spreadsheet or CSV with a food name column.

| Table | Publisher's page | How it is published (checked 2026-11-22) | In the app |
| --- | --- | --- | --- |
| **ARGENFOODS** (Argentina, Universidad Nacional de Luján) | [argenfoods index](http://www.unlu.edu.ar/~argenfoods/Tablas/Varios/Indice.htm) | One Excel file (`.xls`) and one PDF per food group: 12 Excel files in all (cereals, vegetables, fruits, fats and oils, fish and shellfish, meats, milk, eggs, sugary products, miscellaneous; fish and meat each also have a fatty-acids file). The site is plain `http`. | **Preset.** Download the `.xls` of each group you want; each file is imported as its own table named "ARGENFOODS · group". The fatty-acid files hold individual fatty acids the app does not track, so they have little to import. |
| **BEDCA** (Spain, AESAN) | [bedca.net/bdpub](https://www.bedca.net/bdpub/) | A web query only ("Consulta"); no download. All rights reserved. | No preset. Nothing to download: the generic import works only if AESAN gives you a spreadsheet. |
| **Mexico, INCMNSZ** (Tabla de Composición de Alimentos y Productos Alimenticios Mexicanos) | [incmnsz.mx](https://www.incmnsz.mx/) | Listed by INFOODS as a PDF at `incmnsz.mx/2019/TABLAS_ALIMENTOS.pdf`; that address answered "not found" on the check date. No spreadsheet. | No preset. Ask INCMNSZ for a spreadsheet version, then use the generic import. |
| **Colombia, TCAC** (ICBF, Tabla de Composición de Alimentos Colombianos) | [ICBF, TCAC 2018](https://www.icbf.gov.co/tabla-de-composicion-de-alimentos-colombianos-tcac-2018) | A PDF only (2018; the 2015 edition is also a PDF). No spreadsheet. | No preset. Ask ICBF for a spreadsheet version, then use the generic import. |
| **LATINFOODS list** (the regional network's directory) | [FAO INFOODS, Latin America](https://www.fao.org/infoods/infoods/tables-and-databases/latin-america/en/) | A directory, not a data set. It points to each country's own publication: mostly PDF (Chile, Peru, Ecuador, Costa Rica, Uruguay, Central America, Brazil's TACO), a web database (Brazil's TBCA), a CD (Cuba) or print only (Bolivia). Argentina's entry is the ARGENFOODS spreadsheets above. | No preset. For any country's table: if its publisher gives you a spreadsheet, use the generic import; the app does not read PDFs or web pages. |
| **CIQUAL** (France, ANSES) | [ciqual.anses.fr](https://ciqual.anses.fr/) | An Excel file (`.xls`, French and English editions) and XML. Open License (Licence Ouverte), as listed on data.gouv.fr. The publisher's site was in maintenance (HTTP 503) on the check date, so the files could not be opened. | **Preset** (built from the layout of earlier releases and **not checked against the current file**). If it is not recognised, the generic import reads the same labels. |

If a table is published only as a PDF or a web page, the app does not try to read it: a reader for those would be fragile and could silently
misread numbers. Look for the publisher's spreadsheet version. If you copy a table from a PDF into a spreadsheet yourself, check it against the
PDF before relying on it.

## Steps in the app

1. Download the file from the publisher's page above, to your phone (or move it there).
2. Open **Settings → Data → Imported tables → Add a table**. Read the notice, then **Choose a file** and pick it. The app reads `.xlsx`, `.xls`
   and `.csv` files up to 25 MB; a bigger or unreadable file is refused with the reason, and nothing is imported.
3. **Match the columns.** A recognised table arrives filled in; otherwise the app suggests columns from the header labels (Spanish, English,
   Portuguese and French) and you can change each one: the food name, an optional food group, what the values are per (100 g, 100 ml or 1 kg;
   "per portion" and similar cannot be imported), and each nutrient with the unit its column is written in. The rules for reading values are on
   the screen.
4. **Review the import.** You see how many foods and nutrients were found, which rows were left out and why, how many cells are stored as
   unknown, warnings (for example an energy that does not match protein, carbs and fat; it is imported as it is), and a sample of foods as they
   will be stored. Give the table a name: it appears as a tag on every food from it.
5. **Import.** It is all or nothing. Search for a food: foods from your table show the tag. They can be logged, starred and matched by the AI
   scan like any food.
6. To remove a table, go to **Imported tables** and choose **Remove**. All its foods go at once; your logged meals keep their values.

## Limits

- Per 100 ml tables are kept as they are and flagged; the app counts amounts in grams, so 1 ml counts as 1 g there.
- Vitamin A (and other vitamins) in IU is refused because the conversion depends on the compound; vitamin D in IU is converted (40 IU = 1 µg).
- A value no food can have (for example 5,000 kcal per 100 g) leaves its row out, and the review says so; the number is never "fixed".
- Up to 20,000 foods per table and 30 tables.
- A large file can be slow to read on an older phone: the app shows progress and you can cancel.
