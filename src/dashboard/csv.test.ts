import { describe, expect, it } from 'vitest';
import { buildCsv, csvField, csvFilename } from './csv';

describe('csvField', () => {
  it('leaves plain fields untouched', () => {
    expect(csvField('Omar')).toBe('Omar');
    expect(csvField('750')).toBe('750');
  });

  it('quotes fields containing a comma', () => {
    expect(csvField('Smith, Jr')).toBe('"Smith, Jr"');
  });

  it('quotes and doubles internal quotes', () => {
    expect(csvField('She said "hi"')).toBe('"She said ""hi"""');
  });

  it('quotes fields containing a newline', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('leaves Arabic text untouched (no escaping needed)', () => {
    expect(csvField('سارة')).toBe('سارة');
  });

  it('quotes Arabic text that also contains a comma', () => {
    expect(csvField('سارة, ٢')).toBe('"سارة, ٢"');
  });
});

describe('buildCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildCsv(['a'], [['1']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('joins the header and rows with CRLF', () => {
    const csv = buildCsv(['name', 'score'], [['Omar', '801'], ['Lina', '835']]);
    const withoutBom = csv.slice(1);
    expect(withoutBom).toBe('name,score\r\nOmar,801\r\nLina,835\r\n');
  });

  it('keeps Arabic names intact end to end', () => {
    const csv = buildCsv(['name', 'game'], [['سارة', 'أسئلة سريعة']]);
    expect(csv).toContain('سارة,أسئلة سريعة');
  });

  it('escapes a field with a comma, a quote and a newline together', () => {
    const csv = buildCsv(['name'], [['Sara, "the great"\nWinner']]);
    expect(csv).toContain('"Sara, ""the great""\nWinner"');
  });

  it('produces one line per row (no extra blank lines) plus a trailing CRLF', () => {
    const csv = buildCsv(['a'], [['1'], ['2'], ['3']]);
    const withoutBom = csv.slice(1);
    expect(withoutBom.split('\r\n')).toEqual(['a', '1', '2', '3', '']);
  });
});

describe('csvFilename', () => {
  it('includes the day label, variant and date', () => {
    const name = csvFilename('Day 2', 'best', new Date(2026, 8, 24));
    expect(name).toBe('results-day-2-best-2026-09-24.csv');
  });

  it('slugifies an Arabic day label to a readable ASCII fallback', () => {
    const name = csvFilename('اليوم الأول', 'all', new Date(2026, 8, 24));
    expect(name).toMatch(/^results-.*-all-2026-09-24\.csv$/);
  });

  it('never produces an empty slug segment', () => {
    const name = csvFilename('!!!', 'all', new Date(2026, 8, 24));
    expect(name).toBe('results-day-all-2026-09-24.csv');
  });
});
