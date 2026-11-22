import { parseBarcode } from '../code';

describe('barcode check digit (validated locally, before any request)', () => {
  it('accepts a valid EAN-13 and keeps it as the lookup code', () => {
    expect(parseBarcode('3017624010701')).toEqual({ ok: true, code: '3017624010701', format: 'ean13' });
  });

  it('accepts a valid UPC-A and looks it up as the EAN-13 with a leading zero', () => {
    expect(parseBarcode('036000291452')).toEqual({ ok: true, code: '0036000291452', format: 'upca' });
  });

  it('accepts a valid EAN-8 as it is', () => {
    expect(parseBarcode('96385074')).toEqual({ ok: true, code: '96385074', format: 'ean8' });
  });

  it('expands a UPC-E to its UPC-A (Wikipedia example 04252614 -> 042100005264) and then to EAN-13', () => {
    expect(parseBarcode('04252614')).toEqual({ ok: true, code: '0042100005264', format: 'upce' });
  });

  it('ignores spaces and hyphens typed between digits', () => {
    expect(parseBarcode(' 3017 6240-10701 ')).toEqual({ ok: true, code: '3017624010701', format: 'ean13' });
  });

  it('refuses a wrong check digit, for every length', () => {
    for (const code of ['3017624010702', '036000291453', '96385075', '04252615']) {
      expect(parseBarcode(code)).toEqual({ ok: false, reason: 'check_digit' });
    }
  });

  it('refuses text that is not digits', () => {
    expect(parseBarcode('30176240107O1')).toEqual({ ok: false, reason: 'not_digits' });
    expect(parseBarcode('abc')).toEqual({ ok: false, reason: 'not_digits' });
  });

  it('refuses nothing, and lengths that are not a product format', () => {
    expect(parseBarcode('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseBarcode('   ')).toEqual({ ok: false, reason: 'empty' });
    for (const code of ['1', '1234567', '123456789', '12345678901', '12345678901234']) {
      expect(parseBarcode(code)).toEqual({ ok: false, reason: 'length' });
    }
  });
});
