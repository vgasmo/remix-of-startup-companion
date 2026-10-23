import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseHubspotConfig } from './importConfig.ts';
Deno.test('supported import default remains configurable', () => {
  assertEquals(parseHubspotConfig({ default_stage: 'new' }), { default_stage: 'new' });
});
Deno.test('caller cannot add server-owned job settings', () => {
  assertThrows(() => parseHubspotConfig({ create_workspaces: true }), Error, 'unsupported_config_key');
  assertThrows(() => parseHubspotConfig({ program_id: 'foreign' }), Error, 'unsupported_config_key');
});
Deno.test('unexpected stage is rejected rather than persisted', () => {
  assertThrows(() => parseHubspotConfig({ default_stage: 'active' }), Error, 'invalid_default_stage');
});