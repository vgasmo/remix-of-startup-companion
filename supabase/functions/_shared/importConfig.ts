const stages = new Set(['new', 'qualified', 'met', 'proposal_sent', 'negotiating', 'contracted', 'rejected']);

/** Only the supported UI option is caller-owned; job metadata stays server-owned. */
export function parseHubspotConfig(value: unknown): { default_stage?: string } {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_config');
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some(key => key !== 'default_stage')) throw new Error('unsupported_config_key');
  if (config.default_stage === undefined) return {};
  if (typeof config.default_stage !== 'string' || !stages.has(config.default_stage)) throw new Error('invalid_default_stage');
  return { default_stage: config.default_stage };
}