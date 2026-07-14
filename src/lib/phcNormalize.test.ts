import { describe, it, expect } from 'vitest';
import {
  normNifPT, normForeignTaxId, resolveTaxId,
  sanitizePreviewCell, buildPhcHeaderMap, parsePhcRow,
} from './phcNormalize';

describe('normNifPT', () => {
  it('accepts a valid 9-digit NIF', () => {
    // 501442600 is a real, valid PT NIF checksum example.
    expect(normNifPT('501442600')).toBe('501442600');
    expect(normNifPT('PT 501 442 600')).toBe('501442600');
  });
  it('rejects wrong checksum', () => {
    expect(normNifPT('501442601')).toBeNull();
  });
  it('rejects wrong length', () => {
    expect(normNifPT('50144260')).toBeNull();
    expect(normNifPT('5014426000')).toBeNull();
  });
  it('rejects invalid prefix', () => {
    expect(normNifPT('001442600')).toBeNull();
    expect(normNifPT('401442600')).toBeNull();
  });
  it('handles null/empty', () => {
    expect(normNifPT('')).toBeNull();
    expect(normNifPT(null)).toBeNull();
    expect(normNifPT(undefined)).toBeNull();
  });
});

describe('normForeignTaxId', () => {
  it('prefixes with country and never collides with PT NIF', () => {
    expect(normForeignTaxId('B12345678', 'ES')).toBe('foreign:ES:B12345678');
    expect(normForeignTaxId('  gb 123-456 ', 'gb')).toBe('foreign:GB:GB123-456');
  });
  it('returns null for empty', () => {
    expect(normForeignTaxId('', 'ES')).toBeNull();
    expect(normForeignTaxId(null, 'ES')).toBeNull();
  });
});

describe('resolveTaxId', () => {
  it('classifies empty', () => {
    expect(resolveTaxId('', 'Portugal').kind).toBe('empty');
    expect(resolveTaxId(null, null).kind).toBe('empty');
  });
  it('parses PT NIFs when country=Portugal or unknown', () => {
    expect(resolveTaxId('501442600', 'Portugal').normalized).toBe('501442600');
    expect(resolveTaxId('501442600', null).normalized).toBe('501442600');
    expect(resolveTaxId('501442600', 'Portuguesa').kind).toBe('pt');
  });
  it('marks bad-checksum PT NIFs as invalid, does not silently accept them', () => {
    expect(resolveTaxId('501442601', 'Portugal').kind).toBe('invalid');
  });
  it('accepts foreign identifiers when country != Portugal', () => {
    const r = resolveTaxId('B12345678', 'Spain');
    expect(r.kind).toBe('foreign');
    expect(r.normalized).toBe('foreign:SP:B12345678');
  });
});

describe('sanitizePreviewCell', () => {
  it('prefixes formula-triggering strings', () => {
    expect(sanitizePreviewCell('=SUM(1,2)')).toBe("'=SUM(1,2)");
    expect(sanitizePreviewCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(sanitizePreviewCell('-1')).toBe("'-1");
    expect(sanitizePreviewCell('@evil')).toBe("'@evil");
    expect(sanitizePreviewCell('\tinjected')).toBe("'\tinjected");
  });
  it('passes safe strings through', () => {
    expect(sanitizePreviewCell('Acme SA')).toBe('Acme SA');
    expect(sanitizePreviewCell('501442600')).toBe('501442600');
  });
  it('leaves non-strings alone', () => {
    expect(sanitizePreviewCell(42)).toBe(42);
    expect(sanitizePreviewCell(null)).toBe(null);
  });
});

describe('buildPhcHeaderMap + parsePhcRow', () => {
  const headers = [
    'Nome do cliente', 'Nome Abreviado', 'Número de contribuinte',
    'Nome do País', 'Departamento', 'Serviço', 'Edifício',
    'Preço a usar em documentos', 'E-mail', 'Telefone do primeiro contato',
    'Nome do primeiro contato', 'E-mail do primeiro contato',
    'Nome do segundo contato', 'E-mail do segundo contato', 'N.º cliente',
  ];

  it('maps all 15 PHC headers', () => {
    const map = buildPhcHeaderMap(headers);
    expect(Object.keys(map).length).toBe(15);
    expect(map['Nome do cliente']).toBe('organization_name');
    expect(map['N.º cliente']).toBe('phc_customer_id');
    expect(map['Preço a usar em documentos']).toBe('phc_price_list_id');
  });

  it('parses a complete PT row and produces zero validation errors', () => {
    const map = buildPhcHeaderMap(headers);
    const row = parsePhcRow({
      'Nome do cliente': 'Acme Portugal, Lda',
      'Nome Abreviado': 'Acme',
      'Número de contribuinte': '501442600',
      'Nome do País': 'Portugal',
      'Departamento': 'Aceleração',
      'Serviço': 'Sala 12',
      'Edifício': 'Inc. Social',
      'Preço a usar em documentos': 'TARIFA_2024_A',
      'E-mail': 'geral@acme.pt',
      'Telefone do primeiro contato': '+351 244 123 456',
      'Nome do primeiro contato': 'João Silva',
      'E-mail do primeiro contato': 'joao@acme.pt',
      'Nome do segundo contato': '',
      'E-mail do segundo contato': '',
      'N.º cliente': '1042',
    }, map);
    expect(row.phc_customer_id).toBe('1042');
    expect(row.organization_name).toBe('Acme Portugal, Lda');
    expect(row.nif_normalized).toBe('501442600');
    expect(row.nif_kind).toBe('pt');
    expect(row.phc_building_hint).toBe('Inc. Social');
    expect(row.phc_price_list_id).toBe('TARIFA_2024_A');
    expect(row.contact_email).toBe('joao@acme.pt');
    expect(row.organization_phone).toBe('+351244123456');
    expect(row.validation_errors).toEqual([]);
  });

  it('preserves nulls instead of inventing defaults', () => {
    const map = buildPhcHeaderMap(headers);
    const row = parsePhcRow({
      'Nome do cliente': 'MinimalCo',
      'N.º cliente': '9',
    }, map);
    expect(row.organization_short_name).toBeNull();
    expect(row.phc_department).toBeNull();
    expect(row.phc_service_hint).toBeNull();
    expect(row.phc_building_hint).toBeNull();
    expect(row.phc_price_list_id).toBeNull();
    expect(row.organization_email).toBeNull();
    expect(row.contact_email).toBeNull();
    expect(row.nif_kind).toBe('empty');
  });

  it('flags an invalid contact email but keeps the row parseable', () => {
    const map = buildPhcHeaderMap(headers);
    const row = parsePhcRow({
      'Nome do cliente': 'BadContactCo',
      'N.º cliente': '10',
      'E-mail do primeiro contato': 'not-an-email',
    }, map);
    expect(row.validation_errors).toContain('invalid_contact_email');
    expect(row.contact_email).toBeNull();
    expect(row.organization_name).toBe('BadContactCo');
  });

  it('flags missing required identifiers', () => {
    const map = buildPhcHeaderMap(headers);
    const row = parsePhcRow({}, map);
    expect(row.validation_errors).toContain('missing_organization_name');
    expect(row.validation_errors).toContain('missing_phc_customer_id');
  });

  it('classifies foreign taxpayer IDs when country != Portugal', () => {
    const map = buildPhcHeaderMap(headers);
    const row = parsePhcRow({
      'Nome do cliente': 'Foreign Co',
      'N.º cliente': '77',
      'Número de contribuinte': 'B12345678',
      'Nome do País': 'Espanha',
    }, map);
    expect(row.nif_kind).toBe('foreign');
    expect(row.nif_normalized).toMatch(/^foreign:/);
    expect(row.validation_errors).not.toContain('invalid_nif');
  });
});
