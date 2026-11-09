import { describe, expect, it } from 'vitest';
import { safeExternalHref, sanitizeUrl } from './sanitizeUrl';

describe('RC12 local and external URLs', () => {
  it.each(['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/route\u0000'])('refuses external-looking local path %j', (url) => {
    expect(sanitizeUrl(url)).toBeUndefined();
  });
  it('preserves local links', () => {
    expect(sanitizeUrl('/my-workspaces?tab=messages')).toBe('/my-workspaces?tab=messages');
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)'])('refuses executable external URL %j', (url) => {
    expect(safeExternalHref(url)).toBeUndefined();
  });
  it('normalizes external hostnames', () => {
    expect(safeExternalHref('linkedin.com/in/example')).toBe('https://linkedin.com/in/example');
  });
});