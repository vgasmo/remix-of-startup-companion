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
});