import { describe, expect, it } from 'vitest';
import { csvCell, serializeCsv } from './csv';

describe('spreadsheet export security', () => {
  for (const prefix of ['=', '+', '-', '@']) {
    it(`neutralizes ${prefix} with hidden prefixes`, () => {
      expect(csvCell(` \t${prefix}1`)).toBe(`"' \t${prefix}1"`);
    });
  }
  it('preserves quotes, commas and multiline fields', () => {
    expect(serializeCsv([['A,"B"\nC', null, 42]])).toBe('"A,""B""\nC","","42"');
  });
  it('preserves ordinary text without formula prefix', () => {
    expect(csvCell('Startup Leiria')).toBe('"Startup Leiria"');
  });
  it('keeps negative and positive numbers numeric, without stray apostrophe', () => {
    expect(csvCell(-12000)).toBe('"-12000"');
    expect(csvCell('-12000')).toBe('"-12000"');
    expect(csvCell(42.5)).toBe('"42.5"');
    expect(serializeCsv([[-1200]])).toBe('"-1200"');
  });
  it('still neutralizes formula-like non-numeric values', () => {
    expect(csvCell('-1+cmd|\' /C')).toBe('"\'-1+cmd|\' /C"');
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
  });
});