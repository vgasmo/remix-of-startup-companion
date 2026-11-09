import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectDelimiter, parseMoney } from './importConfigCsv.ts';

Deno.test('Portuguese Excel CSV uses semicolons without counting quoted delimiters', () => {
  assertEquals(detectDelimiter('\uFEFFname;value;notes\nStartup;1.500,50;"a,b,c"'), ';');
});
Deno.test('Portuguese thousands 5.000 means 5000', () => assertEquals(parseMoney('5.000'), 5000));
Deno.test('Portuguese decimal 1.500,50 means 1500.5', () => assertEquals(parseMoney('1.500,50'), 1500.5));
Deno.test('English decimal 1,500.50 means 1500.5', () => assertEquals(parseMoney('1,500.50'), 1500.5));
Deno.test('Invalid amounts remain missing rather than zero', () => assertEquals(parseMoney('invalid'), null));