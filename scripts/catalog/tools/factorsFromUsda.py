"""
Converts the two USDA publications used as recipe factors into the committed JSON files of scripts/catalog/data/factors/.
Not part of the build: run it by hand when a new release is published, then read the diff.

    python -I scripts/catalog/tools/factorsFromUsda.py <retn06.txt> <USDA_CookingYields_MeatPoultry02.xlsx> <output dir>

Both inputs are downloaded by hand from the pages cited in docs/catalog-recipes.md section 3 (into an empty directory of its
own; this script only reads them). Standard library only.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# Retention table nutrient numbers -> the app's nutrient codes. Vitamin A is the table's "Vitamin A, RE" (392): the table has no RAE factor.
RETENTION_NUTRIENTS = {
    '301': 'calcium', '303': 'iron', '304': 'magnesium', '306': 'potassium', '307': 'sodium', '309': 'zinc',
    '401': 'vit_c', '417': 'folate', '418': 'vit_b12', '392': 'vit_a',
}


def retention(path):
    rows = {}
    with open(path, encoding='latin-1') as f:
        for line in f:
            parts = [p.strip('~') for p in line.strip().split('^')]
            if len(parts) < 7:
                continue
            code, group, desc, number, _name, factor, _date = parts[:7]
            row = rows.setdefault(code, {'code': code, 'foodGroup': group, 'description': desc, 'percent': {}})
            if number in RETENTION_NUTRIENTS and factor != '':
                row['percent'][RETENTION_NUTRIENTS[number]] = int(factor)
    return sorted(rows.values(), key=lambda r: r['code'])


def num(value):
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def yields(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(M + 'si'):
            shared.append(''.join(t.text or '' for t in si.iter(M + 't')))
    root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    table = []
    for row in root.iter(M + 'row'):
        cells = {}
        for c in row.findall(M + 'c'):
            v = c.find(M + 'v')
            letters = re.match(r'[A-Z]+', c.get('r')).group(0)
            idx = 0
            for ch in letters:
                idx = idx * 26 + ord(ch) - 64
            if v is None:
                continue
            cells[idx - 1] = shared[int(v.text)] if c.get('t') == 's' else v.text
        if cells:
            table.append([cells.get(i, '') for i in range(max(cells) + 1)])
    out = []
    for r in table[1:]:
        r = r + [''] * (12 - len(r))
        if not re.match(r'^\d+$', r[0].strip()):
            continue  # footnotes
        out.append({
            'foodGroup': r[0].strip(),
            'ndb': r[1].strip() or None,
            'description': r[2].strip(),
            'method': r[3].strip(),
            'yieldPercent': num(r[4]),
            'n': num(r[5]),
            'sd': num(r[6]),
            'min': num(r[7]),
            'max': num(r[8]),
            'moistureChangePercent': num(r[9]),
            'fatChangePercent': num(r[10]),
            'releaseYear': r[11].strip(),
        })
    return out


def main():
    retn_path, yields_path, out_dir = sys.argv[1:4]
    r = retention(retn_path)
    y = yields(yields_path)
    with open(out_dir + '/usda-retention-r6.json', 'w', encoding='utf8') as f:
        json.dump({
            'source': {
                'title': 'USDA Table of Nutrient Retention Factors, Release 6',
                'publisher': 'U.S. Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory',
                'date': 'December 2007',
                'url': 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/retn06.txt',
                'page': 'https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/nutrient-retention-factors/',
                'note': 'Percent of the nutrient retained (true retention, nearest 5 %), for the nutrients the app tracks that the table covers. Vitamin A is the table\'s "Vitamin A, RE". Nutrients the table does not cover (energy, macronutrients, fiber, sugars, saturated fat, vitamin D) have no factor.',
            },
            'rows': r,
        }, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(out_dir + '/usda-cooking-yields-r2.json', 'w', encoding='utf8') as f:
        json.dump({
            'source': {
                'title': 'USDA Table of Cooking Yields for Meat and Poultry, Release 2',
                'publisher': 'U.S. Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory',
                'date': 'September 2014',
                'url': 'https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.xlsx',
                'page': 'https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/cooking-yields/',
                'note': 'Cooking yield % = 100 x hot cooked weight / raw weight. Rows are keyed by "ndb|method" in the recipes ("ndb" is empty for a few retail-cut rows: they are keyed by description).',
            },
            'rows': y,
        }, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(len(r), 'retention rows,', len(y), 'yield rows')


main()
