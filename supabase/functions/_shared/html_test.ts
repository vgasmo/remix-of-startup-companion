import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { escapeHtml, interpolateHtml, safeAppUrl } from './html.ts';

Deno.test('untrusted email text cannot introduce markup or attributes', () => {
  assertEquals(escapeHtml(`<a href="x">O'Reilly & Co</a>`), '&lt;a href=&quot;x&quot;&gt;O&#39;Reilly &amp; Co&lt;/a&gt;');
});
Deno.test('CRM replacement preserves trusted template and literal dollar tokens', () => {
  assertEquals(interpolateHtml('<p>{{name}} {{name}}</p>', { name: '<b>$&</b>' }), '<p>&lt;b&gt;$&amp;&lt;/b&gt; &lt;b&gt;$&amp;&lt;/b&gt;</p>');
});
for (const link of ['javascript:alert(1)', 'https://evil.test', '//evil.test', 'https://user:pass@app.test/path']) {
  Deno.test(`notification link rejects ${link}`, () => {
    assertEquals(safeAppUrl(link, 'https://app.test'), 'https://app.test');
  });
}
Deno.test('notification links keep same-origin deep links', () => {
  assertEquals(safeAppUrl('/workspace/123?tab=notes', 'https://app.test'), 'https://app.test/workspace/123?tab=notes');
});