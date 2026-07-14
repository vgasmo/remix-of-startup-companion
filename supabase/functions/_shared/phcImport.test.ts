// Deno tests for the shared PHC import primitives.
// Run with:  deno test supabase/functions/_shared/phcImport.test.ts
//
// These are pure-function tests; the match engine is exercised with a stubbed
// supabase client so we assert priority order and conflict semantics without a
// live database.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normNifPT, normForeignTaxId, resolveTaxId, sanitizePreviewCell,
  buildPhcHeaderMap, parsePhcRow, matchPhcRow, phcRowHash,
} from './phcImport.ts';

// ---- NIF PT --------------------------------------------------------------

Deno.test('normNifPT accepts valid PT NIF', () => {
  // 501 442 600 = "IST" real institutional NIF (mod-11 valid, prefix 5).
  assertEquals(normNifPT('501442600'), '501442600');
  assertEquals(normNifPT(' 501-442-600 '), '501442600');
});

Deno.test('normNifPT rejects invalid checksum', () => {
  assertEquals(normNifPT('501442601'), null);
});

Deno.test('normNifPT rejects bad length / prefix', () => {
  assertEquals(normNifPT('12345678'), null);
  assertEquals(normNifPT('401442600'), null); // prefix 4 alone invalid
});

Deno.test('normNifPT handles null / empty', () => {
  assertEquals(normNifPT(null), null);
  assertEquals(normNifPT(''), null);
  assertEquals(normNifPT(undefined), null);
});

// ---- Foreign passthrough -------------------------------------------------

Deno.test('normForeignTaxId prefixes country code', () => {
  assertEquals(normForeignTaxId('ES-B12345678', 'ES'), 'foreign:ES:ES-B12345678');
  assertEquals(normForeignTaxId(' fr 123 ', 'fr'), 'foreign:FR:FR123');
});

Deno.test('normForeignTaxId falls back to XX when country missing', () => {
  assertEquals(normForeignTaxId('X1', null), 'foreign:XX:X1');
});

// ---- resolveTaxId --------------------------------------------------------

Deno.test('resolveTaxId classifies PT valid', () => {
  const r = resolveTaxId('501442600', 'Portugal');
  assertEquals(r, { normalized: '501442600', kind: 'pt' });
});

Deno.test('resolveTaxId flags PT-country + bad checksum as invalid', () => {
  const r = resolveTaxId('501442699', 'Portugal');
  assertEquals(r.kind, 'invalid');
  assertEquals(r.normalized, null);
});

Deno.test('resolveTaxId passes through non-PT country', () => {
  const r = resolveTaxId('B12345678', 'Spain');
  assertEquals(r.kind, 'foreign');
  assert(r.normalized?.startsWith('foreign:SP:'));
});

Deno.test('resolveTaxId empty', () => {
  assertEquals(resolveTaxId('', 'Portugal').kind, 'empty');
  assertEquals(resolveTaxId(null, null).kind, 'empty');
});

// ---- sanitizePreviewCell -------------------------------------------------

Deno.test('sanitizePreviewCell guards formula prefixes', () => {
  assertEquals(sanitizePreviewCell('=CMD()'), "'=CMD()");
  assertEquals(sanitizePreviewCell('+cmd'), "'+cmd");
  assertEquals(sanitizePreviewCell('-cmd'), "'-cmd");
  assertEquals(sanitizePreviewCell('@cmd'), "'@cmd");
  assertEquals(sanitizePreviewCell('\tcmd'), "'\tcmd");
});

Deno.test('sanitizePreviewCell passes safe strings through', () => {
  assertEquals(sanitizePreviewCell('Acme, Lda.'), 'Acme, Lda.');
  assertEquals(sanitizePreviewCell(''), '');
  assertEquals(sanitizePreviewCell(42), 42);
  assertEquals(sanitizePreviewCell(null), null);
});

// ---- Header map + row parser --------------------------------------------

const SAMPLE_HEADERS = [
  'N.º Cliente', 'Nome do cliente', 'Nome Abreviado', 'Número de contribuinte',
  'Nome do País', 'Departamento', 'Serviço', 'Edifício', 'Preço a usar em documentos',
  'E-mail', 'Telefone do primeiro contato', 'Nome do primeiro contato',
  'E-mail do primeiro contato',
];

Deno.test('buildPhcHeaderMap resolves PHC aliases', () => {
  const map = buildPhcHeaderMap(SAMPLE_HEADERS);
  assertEquals(map['N.º Cliente'], 'phc_customer_id');
  assertEquals(map['Nome do cliente'], 'organization_name');
  assertEquals(map['Número de contribuinte'], 'nif_raw');
  assertEquals(map['Nome do País'], 'country');
  assertEquals(map['Edifício'], 'phc_building_hint');
  assertEquals(map['Preço a usar em documentos'], 'phc_price_list_id');
});

Deno.test('parsePhcRow preserves nulls and flags errors', () => {
  const map = buildPhcHeaderMap(SAMPLE_HEADERS);
  const row = {
    'N.º Cliente': '10001',
    'Nome do cliente': 'Acme, Lda.',
    'Nome Abreviado': 'Acme',
    'Número de contribuinte': '501442600',
    'Nome do País': 'Portugal',
    'Departamento': 'Startups',
    'Serviço': 'Sala privada',
    'Edifício': 'Edificio A',
    'Preço a usar em documentos': 'Tabela 2024',
    'E-mail': 'contact@acme.pt',
    'Telefone do primeiro contato': '+351 912 345 678',
    'Nome do primeiro contato': 'Ana Silva',
    'E-mail do primeiro contato': 'ana@acme.pt',
  };
  const parsed = parsePhcRow(row, map);
  assertEquals(parsed.phc_customer_id, '10001');
  assertEquals(parsed.organization_name, 'Acme, Lda.');
  assertEquals(parsed.nif_normalized, '501442600');
  assertEquals(parsed.nif_kind, 'pt');
  assertEquals(parsed.organization_email, 'contact@acme.pt');
  assertEquals(parsed.contact_email, 'ana@acme.pt');
  assertEquals(parsed.phc_building_hint, 'Edificio A');
  assertEquals(parsed.phc_price_list_id, 'Tabela 2024');
  assertEquals(parsed.validation_errors, []);
});

Deno.test('parsePhcRow reports invalid_nif when PT checksum fails', () => {
  const map = buildPhcHeaderMap(SAMPLE_HEADERS);
  const parsed = parsePhcRow({
    'N.º Cliente': '10002',
    'Nome do cliente': 'Broken NIF, Lda.',
    'Número de contribuinte': '501442699',
    'Nome do País': 'Portugal',
  }, map);
  assertEquals(parsed.nif_normalized, null);
  assertEquals(parsed.nif_kind, 'invalid');
  assert(parsed.validation_errors.includes('invalid_nif'));
});

Deno.test('parsePhcRow flags missing required identifiers', () => {
  const map = buildPhcHeaderMap(SAMPLE_HEADERS);
  const parsed = parsePhcRow({
    'N.º Cliente': '',
    'Nome do cliente': '',
    'Número de contribuinte': '',
  }, map);
  assert(parsed.validation_errors.includes('missing_phc_customer_id'));
  assert(parsed.validation_errors.includes('missing_organization_name'));
});

Deno.test('phcRowHash is deterministic and canonical', async () => {
  const map = buildPhcHeaderMap(SAMPLE_HEADERS);
  const rowA = parsePhcRow({
    'N.º Cliente': '10001',
    'Nome do cliente': 'Acme, Lda.',
    'Número de contribuinte': '501442600',
    'Nome do País': 'Portugal',
  }, map);
  const rowB = parsePhcRow({
    'N.º Cliente': '10001',
    'Nome do cliente': 'Acme, Lda.',
    'Número de contribuinte': '501442600',
    'Nome do País': 'Portugal',
  }, map);
  assertEquals(await phcRowHash(rowA), await phcRowHash(rowB));
});

// ---- Match engine with stub supabase -------------------------------------

function makeSupabaseStub(handlers: Record<string, (b: any) => any>) {
  return {
    from(table: string) {
      const state: any = { table, filters: {}, singleMode: false, limitN: null };
      const chain: any = {
        select(_cols?: string) { return chain; },
        eq(col: string, val: any) { state.filters[col] = val; return chain; },
        ilike(col: string, val: string) { state.filters[`ilike:${col}`] = val; return chain; },
        limit(n: number) { state.limitN = n; return chain; },
        maybeSingle() { state.singleMode = 'maybe'; return handlers[table](state); },
        then(res: any, rej: any) { return Promise.resolve(handlers[table](state)).then(res, rej); },
      };
      return chain;
    },
  };
}

Deno.test('matchPhcRow prefers phc_customer_id (auto)', async () => {
  const sb = makeSupabaseStub({
    funnel_items: (s) => {
      if (s.singleMode === 'maybe' && s.filters.phc_customer_id === '10001') {
        return { data: { id: 'fi-1', updated_at: 'T1' }, error: null };
      }
      return { data: null, error: null };
    },
  });
  const res = await matchPhcRow({
    phc_customer_id: '10001', nif_normalized: '501442600',
    organization_email: 'x@x.pt', organization_name: 'X', nif_kind: 'pt',
  } as any, { supabase: sb });
  assertEquals(res.method, 'phc_customer_id');
  assertEquals(res.entity_id, 'fi-1');
  assertEquals(res.confidence, 1);
});

Deno.test('matchPhcRow returns conflict when NIF ambiguous', async () => {
  const sb = makeSupabaseStub({
    funnel_items: (s) => {
      if (s.filters.phc_customer_id) return { data: null, error: null };
      if (s.filters.nif_normalized) return { data: [{ id: 'a', updated_at: 'T1' }, { id: 'b', updated_at: 'T2' }], error: null };
      return { data: null, error: null };
    },
  });
  const res = await matchPhcRow({
    phc_customer_id: null, nif_normalized: '501442600',
    organization_email: null, organization_name: null, nif_kind: 'pt',
  } as any, { supabase: sb });
  assertEquals(res.method, 'conflict');
  assertEquals(res.candidates, 2);
});

Deno.test('matchPhcRow email match stays suggested (below auto threshold)', async () => {
  const sb = makeSupabaseStub({
    funnel_items: (s) => {
      if (s.filters.phc_customer_id) return { data: null, error: null };
      if (s.filters.nif_normalized) return { data: [], error: null };
      if (s.filters.contact_email) return { data: [{ id: 'fi-e', updated_at: 'T3' }], error: null };
      return { data: null, error: null };
    },
  });
  const res = await matchPhcRow({
    phc_customer_id: null, nif_normalized: null,
    organization_email: 'x@x.pt', organization_name: null, nif_kind: 'empty',
  } as any, { supabase: sb });
  assertEquals(res.method, 'email');
  assertEquals(res.confidence, 0.6);
});

Deno.test('matchPhcRow returns none when nothing matches', async () => {
  const sb = makeSupabaseStub({
    funnel_items: () => ({ data: null, error: null }),
  });
  const res = await matchPhcRow({
    phc_customer_id: null, nif_normalized: null,
    organization_email: null, organization_name: null, nif_kind: 'empty',
  } as any, { supabase: sb });
  assertEquals(res.method, 'none');
  assertEquals(res.entity_id, null);
});
