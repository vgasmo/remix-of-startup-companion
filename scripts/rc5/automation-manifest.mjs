export function parseManifest(md) {
  const rows = [];
  const names = new Set();
  for (const line of md.split('\n')) {
    if (!line.startsWith('| ') || line.startsWith('| name')) continue;
    const cols = line.split('|').slice(1, -1).map(c => c.trim().replaceAll('`', ''));
    if (cols.length !== 8) throw new Error('invalid_manifest_row');
    const [name, trigger, schedule, target, owner, flag, health, cadence] = cols;
    if (names.has(name)) throw new Error(`duplicate_manifest_name: ${name}`);
    if (!['cron', 'event', 'manual', 'dynamic'].includes(trigger)) throw new Error(`invalid_trigger: ${name}`);
    if (!name || !target || !health || !Number.isInteger(Number(cadence)) || Number(cadence) < 0) throw new Error(`invalid_manifest_row: ${name}`);
    if (trigger === 'cron' && (!/^\S+(?:\s+\S+){4}$/.test(schedule) || Number(cadence) === 0)) throw new Error(`invalid_schedule: ${name}`);
    names.add(name);
    rows.push({ name, trigger, schedule, target, owner, flag: flag === '—' ? '' : flag, health, cadence: Number(cadence) });
  }
  if (!rows.length) throw new Error('empty_manifest');
  return rows;
}

export function commandTarget(command) {
  const edge = command.match(/^\s*SELECT\s+public\.cron_invoke_edge\(\s*'([a-z0-9-]+)'/i);
  if (edge) return edge[1];
  const rpc = command.match(/^\s*SELECT\s+public\.cron_invoke_rpc\(\s*'[a-z0-9_-]+'\s*,\s*'public\.([a-z0-9_]+)\(/i);
  if (rpc) return `RPC public.${rpc[1]}`;
  const direct = command.match(/^\s*SELECT\s+public\.([a-z0-9_]+)\(\s*\)\s*;?\s*$/i);
  return direct ? `RPC public.${direct[1]}` : null;
}

export function reconcileManifest(manifest, crons, health) {
  const drift = [];
  const registry = new Map(health.map(h => [h.job_name, h]));
  const known = new Map(manifest.map(m => [m.name, m]));
  for (const row of manifest) {
    const jobs = crons.filter(c => c.jobname === row.name);
    if (row.trigger === 'cron' && jobs.length === 0) drift.push(`missing_schedule: ${row.name}`);
    if (jobs.length > 1) drift.push(`duplicate_schedule: ${row.name}`);
    if (jobs.length && ['event', 'manual'].includes(row.trigger)) drift.push(`dead_cron: ${row.name}`);
    for (const job of jobs) {
      if (!job.active) drift.push(`inactive_schedule: ${row.name}`);
      if (['cron', 'dynamic'].includes(row.trigger) && job.schedule.trim().replace(/\s+/g, ' ') !== row.schedule) drift.push(`schedule_mismatch: ${row.name}`);
      if (commandTarget(job.command) !== row.target) drift.push(`target_mismatch: ${row.name}`);
    }
    if (row.health !== 'no_health_expectation') {
      const expectation = registry.get(row.health);
      if (!expectation) drift.push(`missing_registry: ${row.name}`);
      else if (row.trigger === 'cron' || jobs.length) {
        if (!expectation.enabled) drift.push(`disabled_registry: ${row.name}`);
        if (Number(expectation.expected_cadence_seconds) !== row.cadence) drift.push(`cadence_mismatch: ${row.name}`);
      }
    }
  }
  for (const cron of crons) if (!known.has(cron.jobname)) drift.push(`unregistered_cron: ${cron.jobname}`);
  return drift;
}
