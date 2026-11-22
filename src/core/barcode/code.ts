// Product barcodes: EAN-13, EAN-8, UPC-A and UPC-E (the four formats the scanner is restricted to).
// The check digit is validated on the device so a mistyped number never costs a request (docs/09 section 2.6).

export type BarcodeFormat = 'ean13' | 'ean8' | 'upca' | 'upce';

export type BarcodeParse =
  | {
      ok: true;
      /** What is looked up and cached: 13 digits (a UPC-A or UPC-E is the EAN-13 with leading zeros) or the 8 digits of an EAN-8. */
      code: string;
      format: BarcodeFormat;
    }
  | { ok: false; reason: 'empty' | 'not_digits' | 'length' | 'check_digit' };

/** Weights 3, 1, 3, 1… from the digit next to the check digit; the check digit completes the sum to a multiple of 10. */
function checkDigitOf(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

const hasValidCheckDigit = (code: string): boolean => checkDigitOf(code.slice(0, -1)) === Number(code.slice(-1));

/** UPC-E (number system 0 or 1, six digits, check digit) to the 12 digits of the UPC-A it stands for. */
function expandUpcE(code: string): string {
  const [system, d1, d2, d3, d4, d5, d6] = code;
  const check = code[7];
  switch (d6) {
    case '0':
    case '1':
    case '2':
      return `${system}${d1}${d2}${d6}0000${d3}${d4}${d5}${check}`;
    case '3':
      return `${system}${d1}${d2}${d3}00000${d4}${d5}${check}`;
    case '4':
      return `${system}${d1}${d2}${d3}${d4}00000${d5}${check}`;
    default:
      return `${system}${d1}${d2}${d3}${d4}${d5}0000${d6}${check}`;
  }
}

/** Reads what was scanned or typed. Spaces and hyphens between digits are ignored. */
export function parseBarcode(input: string): BarcodeParse {
  const text = input.replace(/[\s-]/g, '');
  if (text === '') return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'not_digits' };

  switch (text.length) {
    case 13:
      return hasValidCheckDigit(text) ? { ok: true, code: text, format: 'ean13' } : { ok: false, reason: 'check_digit' };
    case 12:
      return hasValidCheckDigit(text) ? { ok: true, code: `0${text}`, format: 'upca' } : { ok: false, reason: 'check_digit' };
    case 8: {
      // The same eight digits can be an EAN-8 or a UPC-E; either one valid is enough.
      if (hasValidCheckDigit(text)) return { ok: true, code: text, format: 'ean8' };
      if (text[0] === '0' || text[0] === '1') {
        const upcA = expandUpcE(text);
        if (hasValidCheckDigit(upcA)) return { ok: true, code: `0${upcA}`, format: 'upce' };
      }
      return { ok: false, reason: 'check_digit' };
    }
    default:
      return { ok: false, reason: 'length' };
  }
}
