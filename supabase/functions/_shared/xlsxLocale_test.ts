// Deno unit tests for the locale-safe number parser.
// Run: deno test supabase/functions/_shared/xlsxLocale_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseLocalizedNumber, parseLocalizedPercent } from "./xlsxLocale.ts";

Deno.test("pt-PT thousands + decimal", () => {
  assertEquals(parseLocalizedNumber("1.234,56"), 1234.56);
  assertEquals(parseLocalizedNumber("1.234.567,89"), 1234567.89);
  assertEquals(parseLocalizedNumber("€ 1.234,56"), 1234.56);
});

Deno.test("en-US thousands + decimal", () => {
  assertEquals(parseLocalizedNumber("1,234.56"), 1234.56);
  assertEquals(parseLocalizedNumber("1,234,567.89"), 1234567.89);
  assertEquals(parseLocalizedNumber("$1,234.56"), 1234.56);
});

Deno.test("bare numbers", () => {
  assertEquals(parseLocalizedNumber("1234.56"), 1234.56);
  assertEquals(parseLocalizedNumber("1234,56"), 1234.56);
  assertEquals(parseLocalizedNumber("42"), 42);
  assertEquals(parseLocalizedNumber("0"), 0);
});

Deno.test("ambiguous single separator with 3-digit tail treated as thousands", () => {
  assertEquals(parseLocalizedNumber("1,234"), 1234);
  assertEquals(parseLocalizedNumber("1.234"), 1234);
});

Deno.test("multiple same separators always thousands", () => {
  assertEquals(parseLocalizedNumber("1.234.567"), 1234567);
  assertEquals(parseLocalizedNumber("1,234,567"), 1234567);
});

Deno.test("negatives via parens or minus", () => {
  assertEquals(parseLocalizedNumber("(1.234,56)"), -1234.56);
  assertEquals(parseLocalizedNumber("-1,234.56"), -1234.56);
  assertEquals(parseLocalizedNumber("1.234,56-"), -1234.56);
});

Deno.test("empty and sentinels", () => {
  assertEquals(parseLocalizedNumber(""), null);
  assertEquals(parseLocalizedNumber("-"), null);
  assertEquals(parseLocalizedNumber("—"), null);
  assertEquals(parseLocalizedNumber("N/A"), null);
  assertEquals(parseLocalizedNumber(null), null);
  assertEquals(parseLocalizedNumber(undefined), null);
});

Deno.test("passthrough numbers and rejects garbage", () => {
  assertEquals(parseLocalizedNumber(3.14), 3.14);
  assertEquals(parseLocalizedNumber("abc"), null);
  assertEquals(parseLocalizedNumber("1.2.3.4x"), null);
});

Deno.test("percent-aware parser", () => {
  assertEquals(parseLocalizedPercent("23%"), 0.23);
  assertEquals(parseLocalizedPercent("23,75%"), 0.2375);
  assertEquals(parseLocalizedPercent("23.75%"), 0.2375);
  assertEquals(parseLocalizedPercent("0.21"), 0.21);
  assertEquals(parseLocalizedPercent(0.21), 0.21);
});
