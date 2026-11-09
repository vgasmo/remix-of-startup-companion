import { describe, expect, it } from 'vitest';
import { redactPathForLogs, redactUrlForLogs } from './logError';

describe('RC12 bearer redaction', () => {
  it.each(['share', 'book', 'survey', 'contract-signing', 'contract-intake', 'dataroom/shared'])('redacts %s path credentials', (route) => {
    expect(redactPathForLogs(`/${route}/sensitive-token`)).toBe(`/${route}/[redacted]`);
  });
  it('redacts sensitive parameters and removes the fragment', () => {
    const result = new URL(redactUrlForLogs('https://example.test/reset-password?token_hash=secret&code=private&tab=settings#access_token=private'));
    expect(result.searchParams.get('token_hash')).toBe('[redacted]');
    expect(result.searchParams.get('code')).toBe('[redacted]');
    expect(result.searchParams.get('tab')).toBe('settings');
    expect(result.hash).toBe('');
  });
  it('keeps ordinary workspace paths', () => {
    expect(redactPathForLogs('/workspace/123')).toBe('/workspace/123');
  });
});