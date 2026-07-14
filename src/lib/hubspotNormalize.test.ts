import { describe, it, expect } from 'vitest';
import {
  normEmail, normNif, normPhone, normCompany, normHubspotId,
  extractEmailFromText, mapStage, DEFAULT_STAGE_MAP,
} from './hubspotNormalize';

describe('hubspotNormalize', () => {
  describe('normEmail', () => {
    it('lowercases and trims', () => {
      expect(normEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    });
    it('rejects malformed', () => {
      expect(normEmail('not-an-email')).toBeNull();
      expect(normEmail('')).toBeNull();
      expect(normEmail(null)).toBeNull();
    });
  });

  describe('normNif', () => {
    it('strips non-digits', () => {
      expect(normNif('PT 501 234 567')).toBe('501234567');
    });
    it('requires 8+ digits', () => {
      expect(normNif('1234')).toBeNull();
      expect(normNif('12345678')).toBe('12345678');
    });
  });

  describe('normPhone', () => {
    it('keeps digits and leading +', () => {
      expect(normPhone(' +351 (912) 345-678 ')).toBe('+351912345678');
    });
    it('rejects too short', () => {
      expect(normPhone('123')).toBeNull();
    });
  });

  describe('normCompany', () => {
    it('collapses whitespace', () => {
      expect(normCompany('  Acme   Inc.  ')).toBe('Acme Inc.');
    });
    it('returns null for empty', () => {
      expect(normCompany('  ')).toBeNull();
    });
  });

  describe('normHubspotId', () => {
    it('accepts numeric and alphanumeric', () => {
      expect(normHubspotId('12345')).toBe('12345');
      expect(normHubspotId('abc_123-XY')).toBe('abc_123-XY');
    });
    it('rejects garbage', () => {
      expect(normHubspotId('with spaces')).toBeNull();
      expect(normHubspotId('')).toBeNull();
      expect(normHubspotId(null)).toBeNull();
    });
  });

  describe('extractEmailFromText', () => {
    it('finds first email in a contact string', () => {
      expect(extractEmailFromText('João Silva <joao@example.com>')).toBe('joao@example.com');
    });
    it('returns null when none', () => {
      expect(extractEmailFromText('no email here')).toBeNull();
    });
  });

  describe('mapStage', () => {
    it('maps common HubSpot stages deterministically', () => {
      expect(mapStage('Won')).toBe('contracted');
      expect(mapStage('closedwon')).toBe('contracted');
      expect(mapStage('Ganho')).toBe('contracted');
      expect(mapStage('lost')).toBe('lost');
      expect(mapStage('discovery')).toBe('discovery');
      expect(mapStage('proposta')).toBe('proposal');
    });
    it('does NOT auto-map Tier A/B/C to contracted', () => {
      // Regression guard for the legacy defect.
      expect(mapStage('Tier A')).toBeNull();
      expect(mapStage('Tier B')).toBeNull();
      expect(mapStage('Tier C')).toBeNull();
      expect(mapStage('qualified')).toBe('qualified');
      // qualified must NOT become "contracted"
      expect(DEFAULT_STAGE_MAP['qualified']).not.toBe('contracted');
    });
    it('honors custom overrides', () => {
      expect(mapStage('Onboarding', { onboarding: 'contracted' })).toBe('contracted');
    });
    it('returns null for unknown', () => {
      expect(mapStage('anything-else')).toBeNull();
      expect(mapStage(null)).toBeNull();
    });
  });
});
