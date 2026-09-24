import { describe, expect, it } from 'vitest';
import { cleanName, nameKey, normalizeCode, normalizeDigits, validateName } from './names';

// Test vectors from docs/SCORING.md §6 — must pass in both SQL and client tests.
describe('SCORING.md §6 test vectors', () => {
  it('"  Sara  " -> cleaned "Sara", valid, key "sara"', () => {
    expect(cleanName('  Sara  ')).toBe('Sara');
    expect(validateName('  Sara  ')).toEqual({ ok: true, cleaned: 'Sara' });
    expect(nameKey('  Sara  ')).toBe('sara');
  });

  it('"SARA" -> cleaned "SARA", valid, key "sara"', () => {
    expect(cleanName('SARA')).toBe('SARA');
    expect(validateName('SARA')).toEqual({ ok: true, cleaned: 'SARA' });
    expect(nameKey('SARA')).toBe('sara');
  });

  it('"أحمد" -> cleaned "أحمد", valid, key "احمد"', () => {
    expect(cleanName('أحمد')).toBe('أحمد');
    expect(validateName('أحمد')).toEqual({ ok: true, cleaned: 'أحمد' });
    expect(nameKey('أحمد')).toBe('احمد');
  });

  it('"احمد" -> cleaned "احمد", valid, key "احمد"', () => {
    expect(cleanName('احمد')).toBe('احمد');
    expect(validateName('احمد')).toEqual({ ok: true, cleaned: 'احمد' });
    expect(nameKey('احمد')).toBe('احمد');
  });

  it('"مُحَمَّد" -> cleaned "محمد" (diacritics stripped), valid, key "محمد"', () => {
    expect(cleanName('مُحَمَّد')).toBe('محمد');
    expect(validateName('مُحَمَّد')).toEqual({ ok: true, cleaned: 'محمد' });
    expect(nameKey('مُحَمَّد')).toBe('محمد');
  });

  it('"Zé 99" -> cleaned "Zé 99", valid, key "zé 99"', () => {
    expect(cleanName('Zé 99')).toBe('Zé 99');
    expect(validateName('Zé 99')).toEqual({ ok: true, cleaned: 'Zé 99' });
    expect(nameKey('Zé 99')).toBe('zé 99');
  });

  it('"Lina٣" -> cleaned "Lina٣", valid, key "lina3"', () => {
    expect(cleanName('Lina٣')).toBe('Lina٣');
    expect(validateName('Lina٣')).toEqual({ ok: true, cleaned: 'Lina٣' });
    expect(nameKey('Lina٣')).toBe('lina3');
  });

  it('"Abdulrahmann1" (13 chars) -> too_long', () => {
    expect(validateName('Abdulrahmann1')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('"Sam!" -> invalid_chars', () => {
    expect(validateName('Sam!')).toEqual({ ok: false, reason: 'invalid_chars' });
  });

  it('"🔥Ali" -> invalid_chars', () => {
    expect(validateName('🔥Ali')).toEqual({ ok: false, reason: 'invalid_chars' });
  });

  it('"Hassan" -> cleaned "Hassan", valid, key "hassan" (client does not apply the blocklist)', () => {
    expect(cleanName('Hassan')).toBe('Hassan');
    expect(validateName('Hassan')).toEqual({ ok: true, cleaned: 'Hassan' });
    expect(nameKey('Hassan')).toBe('hassan');
  });
});

describe('validateName edge cases', () => {
  it('empty string -> empty', () => {
    expect(validateName('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('whitespace-only string -> empty', () => {
    expect(validateName('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('exactly 12 code points is valid', () => {
    const twelve = 'A'.repeat(12);
    expect(validateName(twelve)).toEqual({ ok: true, cleaned: twelve });
  });

  it('exactly 13 code points is too_long', () => {
    const thirteen = 'A'.repeat(13);
    expect(validateName(thirteen)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('internal whitespace collapses before the length check', () => {
    expect(validateName('A   B')).toEqual({ ok: true, cleaned: 'A B' });
  });
});

describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits to ASCII', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('converts Extended Arabic-Indic digits to ASCII', () => {
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('leaves ASCII digits and other characters untouched', () => {
    expect(normalizeDigits('Lina٣ 4821')).toBe('Lina3 4821');
  });
});

describe('normalizeCode', () => {
  it('normalises Arabic-Indic digits then validates', () => {
    expect(normalizeCode('٤٨٢١')).toBe('4821');
  });

  it('accepts a plain 4-digit code in range', () => {
    expect(normalizeCode('1000')).toBe('1000');
    expect(normalizeCode('9999')).toBe('9999');
  });

  it('rejects a code below 1000 (e.g. leading zero)', () => {
    expect(normalizeCode('0123')).toBeNull();
  });

  it('rejects a code with the wrong number of digits', () => {
    expect(normalizeCode('123')).toBeNull();
    expect(normalizeCode('12345')).toBeNull();
  });

  it('rejects non-digit input', () => {
    expect(normalizeCode('abcd')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(normalizeCode('')).toBeNull();
  });
});
