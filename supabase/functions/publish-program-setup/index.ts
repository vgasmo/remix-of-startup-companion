import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProgramModeSettings {
  program_mode: 'standard' | 'basic';
  enable_kpis: boolean;
  enable_health: boolean;
  enable_milestones: boolean;
  enable_alerts: boolean;
  enable_playbooks: boolean;
  enable_financial_model: boolean;
}

interface DraftData {
  basics: {
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    settings?: ProgramModeSettings;
    program_type?: 'incubation' | 'acceleration';
  };
  gates?: {
    id?: string;
    __local_id?: string;
    name: string;
    description?: string;
    sort_order: number;
    target_start_week?: number;
    target_end_week?: number;
  }[];
  weeks?: {
    id?: string;
    gate_id?: string;
    week_number: number;
    title: string;
    description?: string;
    deliverables_json: { title: string; description?: string; template_id?: string | null }[];
  }[];
  stages: {
    stage_key: string;
    name: string;
    description?: string;
    position: number;
    is_active: boolean;
  }[];
  kpis: {
    stage_key: string;
    kpis: {
      name: string;
      unit?: string;
      category?: string;
      description?: string;
      direction?: string;
      is_required: boolean;
      order_index: number;
      target_value?: number;
      kpi_definition_id?: string; // existing KPI
    }[];
  }[];
  coreKpis: {
    name: string;
    kpi_definition_id?: string;
    order_index: number;
  }[];
  playbooks: {
    stage_key: string;
    title: string;
    description?: string;
    items: {
      item_type: 'milestone' | 'action';
      title: string;
      description?: string;
      relative_due_days?: number;
      priority?: string;
      order_index: number;
      default_owner_role?: string;
      metadata_json?: Record<string, unknown>;
    }[];
  }[];
  alertRules: {
    rule_type: string;
    threshold: number;
    severity: string;
    is_enabled: boolean;
  }[];
  healthModel?: {
    weights_json: Record<string, number>;
    thresholds_json: Record<string, number>;
    is_enabled: boolean;
  };
}

// Canonical defaults for program-mode settings. Used when a draft has no
// settings_json yet (e.g. published from a very early draft) so we never
// reference an undefined `settingsJson` during programs INSERT/UPDATE.
const DEFAULT_PROGRAM_SETTINGS: ProgramModeSettings = {
  program_mode: 'standard',
  enable_kpis: true,
  enable_health: true,
  enable_milestones: true,
  enable_alerts: true,
  enable_playbooks: true,
  enable_financial_model: false,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Hoisted so the catch block can mark the draft as 'publish_failed'
  // even if the failure happened before the inner try logic finished.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  let draftIdForCatch: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user from token
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin or consultor
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdminOrConsultor = roles?.some(r => r.role === 'admin' || r.role === 'consultor');
    if (!isAdminOrConsultor) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { draft_id } = await req.json();
    if (!draft_id) {
      return new Response(JSON.stringify({ error: 'draft_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    draftIdForCatch = draft_id;

    console.log(`[publish-program-setup] Publishing draft ${draft_id} by user ${user.id}`);

    // Fetch draft
    const { data: draft, error: draftError } = await supabase
      .from('program_setup_drafts')
      .select('*')
      .eq('id', draft_id)
      .single();

    if (draftError || !draft) {
      console.error('[publish-program-setup] Draft not found:', draftError);
      return new Response(JSON.stringify({ error: 'Draft not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (draft.status !== 'draft' && draft.status !== 'publish_failed') {
      return new Response(JSON.stringify({ error: 'Draft already published or discarded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const draftData = draft.draft_json as DraftData;
    // Canonical settings — never undefined when we hit programs INSERT/UPDATE.
    const settingsJson: ProgramModeSettings = {
      ...DEFAULT_PROGRAM_SETTINGS,
      ...(draftData.basics?.settings || {}),
    };

    const validationErrors: string[] = [];
    if (!draftData.basics?.name?.trim()) validationErrors.push('Program name is required');
    
    const isAcceleration = draftData.basics?.program_type === 'acceleration';
    
    // Stage validation only for incubation programs
    if (!isAcceleration) {
      const activeStages = draftData.stages?.filter(s => s.is_active) || [];
      if (activeStages.length === 0) validationErrors.push('At least one stage must be active');
    } else {
      // Acceleration: stricter invariants
      const gates = draftData.gates || [];
      const weeks = draftData.weeks || [];
      if (gates.length === 0) {
        validationErrors.push('At least one gate is required for acceleration programs');
      }
      if (weeks.length === 0) {
        validationErrors.push('At least one week is required for acceleration programs');
      }
      for (const g of gates) {
        if (!g.name || !g.name.trim()) {
          validationErrors.push('All gates must have a non-empty name');
          break;
        }
      }
      for (const w of weeks) {
        if (!Number.isInteger(w.week_number) || w.week_number < 1 || w.week_number > 104) {
          validationErrors.push(`Week ${w.week_number} has an invalid week_number (must be integer 1-104)`);
          break;
        }
      }
      const wkNums = weeks.map(w => w.week_number);
      if (new Set(wkNums).size !== wkNums.length) {
        validationErrors.push('Duplicate week_number values are not allowed');
      }
    }
    
    // Core KPI validation only for standard mode with KPIs enabled
    const settings = draftData.basics?.settings;
    const isBasicMode = settings?.program_mode === 'basic';
    const kpisEnabled = settings?.enable_kpis !== false;
    
    if (!isAcceleration && !isBasicMode && kpisEnabled) {
      const coreKpiCount = draftData.coreKpis?.length || 0;
      if (coreKpiCount < 3 || coreKpiCount > 6) {
        validationErrors.push('Core KPIs must be between 3 and 6 for standard mode');
      }
    }

    // Check for duplicate KPIs in same stage
    for (const stageKpis of draftData.kpis || []) {
      const names = stageKpis.kpis.map(k => k.name.toLowerCase());
      const uniqueNames = new Set(names);
      if (names.length !== uniqueNames.size) {
        validationErrors.push(`Duplicate KPIs found in stage ${stageKpis.stage_key}`);
      }
    }

    // Check alert rule thresholds
    for (const rule of draftData.alertRules || []) {
      if (rule.threshold < 0) {
        validationErrors.push(`Alert rule ${rule.rule_type} has negative threshold`);
      }
    }

    // Check health model weights sum
    if (draftData.healthModel?.is_enabled) {
      const weights = Object.values(draftData.healthModel.weights_json);
      const sum = weights.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.1) {
        validationErrors.push(`Health model weights must sum to 100 (current: ${sum})`);
      }
    }

    if (validationErrors.length > 0) {
      console.log('[publish-program-setup] Validation errors:', validationErrors);
      return new Response(JSON.stringify({ error: 'Validation failed', details: validationErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- ATOMIC-STYLE PUBLISH ---
    // NOTE: This is not a true SQL transaction (edge function uses PostgREST,
    // not a single connection). Hardening: every write is now error-checked
    // and the program is created/updated as 'draft' first; status flips to
    // 'active' only after every child write succeeds (last step). On any
    // failure the catch block marks the draft as 'publish_failed' so the
    // staff sees a clear remediation surface instead of a half-published
    // program. A future improvement is to move this whole orchestration
    // into a single PostgreSQL function.
    let programId = draft.program_id;
    const programTypeFinal = draftData.basics.program_type || 'incubation';
    const isAccelerationFinal = programTypeFinal === 'acceleration';

    if (programId) {
      // Update existing program — keep current status, do not flip to active yet.
      const { error: updateError } = await supabase
        .from('programs')
        .update({
          name: draftData.basics.name,
          description: draftData.basics.description || null,
          start_date: draftData.basics.start_date || null,
          end_date: draftData.basics.end_date || null,
          settings_json: settingsJson,
          program_type: programTypeFinal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', programId);

      if (updateError) throw new Error(`Failed to update program: ${updateError.message}`);
      console.log(`[publish-program-setup] Updated program ${programId}`);
    } else {
      // Create new program in 'draft' status — flipped to 'active' on full success.
      const { data: newProgram, error: createError } = await supabase
        .from('programs')
        .insert({
          name: draftData.basics.name,
          description: draftData.basics.description || null,
          start_date: draftData.basics.start_date || null,
          end_date: draftData.basics.end_date || null,
          settings_json: settingsJson,
          program_type: programTypeFinal,
          status: 'draft',
          is_active: false,
        })
        .select()
        .single();

      if (createError || !newProgram) throw new Error(`Failed to create program: ${createError?.message}`);
      programId = newProgram.id;
      console.log(`[publish-program-setup] Created program ${programId} (draft, will activate on success)`);
    }

    // ===== Quarantine incompatible config when program_type changed =====
    // If publishing as 'acceleration', wipe stage-only artifacts (stages,
    // playbooks, stage_kpi_defaults). If publishing as 'incubation', wipe
    // acceleration artifacts (gates, weeks). Prevents drift between modes.
    if (isAccelerationFinal) {
      const { data: pbRows } = await supabase.from('playbooks').select('id').eq('program_id', programId);
      const pbIds = (pbRows || []).map((p: { id: string }) => p.id);
      const stageWipes = await Promise.all([
        supabase.from('stage_kpi_defaults').delete().eq('program_id', programId),
        pbIds.length > 0
          ? supabase.from('playbook_items').delete().in('playbook_id', pbIds)
          : Promise.resolve({ error: null }),
        supabase.from('playbooks').delete().eq('program_id', programId),
        supabase.from('stages').delete().eq('program_id', programId),
      ]);
      const wipeErrs = stageWipes.map(r => (r as { error: unknown }).error).filter(Boolean);
      if (wipeErrs.length) {
        throw new Error(`Failed to quarantine stage-side artifacts: ${JSON.stringify(wipeErrs)}`);
      }
    } else {
      const accWipes = await Promise.all([
        supabase.from('program_weeks').delete().eq('program_id', programId),
        supabase.from('program_gates').delete().eq('program_id', programId),
      ]);
      const wipeErrs = accWipes.map(r => r.error).filter(Boolean);
      if (wipeErrs.length) {
        throw new Error(`Failed to quarantine acceleration-side artifacts: ${JSON.stringify(wipeErrs)}`);
      }
    }

    // 2. Upsert stages metadata (incubation only)
    if (draftData.basics.program_type !== 'acceleration') {
    for (const stage of draftData.stages || []) {
      // Check if stage exists
      const { data: existing } = await supabase
        .from('stages')
        .select('id')
        .eq('program_id', programId)
        .eq('stage_key', stage.stage_key)
        .single();

      if (existing) {
        await supabase
          .from('stages')
          .update({
            name: stage.name,
            description: stage.description,
            position: stage.position,
            is_active: stage.is_active,
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('stages').insert({
          program_id: programId,
          stage_key: stage.stage_key,
          name: stage.name,
          description: stage.description,
          position: stage.position,
          is_active: stage.is_active,
        });
      }
    }
    console.log(`[publish-program-setup] Upserted ${draftData.stages?.length || 0} stages`);
    } // end incubation-only stages block

    // 2b. Upsert gates and weeks (acceleration only).
    // Note: gates/weeks were already wiped in the quarantine step above —
    // do not re-delete here (would race with the inserts below).
    if (draftData.basics.program_type === 'acceleration') {
      // Insert gates and build a stable-id → real-id map.
      // Accepts either persisted DB id, the wizard's __local_id, or (legacy) `gate-<sort_order>`.
      const gateIdMap: Record<string, string> = {};
      // Track gate ranges for fallback gate_id resolution by week_number.
      const gateRanges: { id: string; start: number | null; end: number | null }[] = [];
      for (const gate of draftData.gates || []) {
        const { data: newGate, error: gateError } = await supabase
          .from('program_gates')
          .insert({
            program_id: programId,
            name: gate.name,
            description: gate.description || null,
            sort_order: gate.sort_order,
            target_start_week: gate.target_start_week || null,
            target_end_week: gate.target_end_week || null,
          })
          .select('id')
          .single();

          if (gateError || !newGate) {
            throw new Error(`Failed to create gate "${gate.name}": ${gateError?.message ?? 'unknown error'}`);
          }
        if (gate.id) gateIdMap[gate.id] = newGate.id;
        if (gate.__local_id) gateIdMap[gate.__local_id] = newGate.id;
        // Backwards-compat with older drafts created before stable IDs landed.
        gateIdMap[`gate-${gate.sort_order}`] = newGate.id;
        gateRanges.push({
          id: newGate.id,
          start: gate.target_start_week ?? null,
          end: gate.target_end_week ?? null,
        });
      }
      console.log(`[publish-program-setup] Created ${(draftData.gates || []).length} gates (id map keys=${Object.keys(gateIdMap).length})`);

      // Insert weeks. Resolve gate_id in this order:
      //   1. explicit week.gate_id mapped through gateIdMap
      //   2. fallback: pick the gate whose target_start_week..target_end_week
      //      contains week.week_number
      //   3. null (week is orphaned — logged for visibility)
      const orphanWeeks: number[] = [];
      for (const week of draftData.weeks || []) {
        let resolvedGateId: string | null = week.gate_id ? (gateIdMap[week.gate_id] ?? null) : null;
        if (!resolvedGateId) {
          const match = gateRanges.find(g =>
            g.start !== null && g.end !== null &&
            week.week_number >= g.start && week.week_number <= g.end,
          );
          resolvedGateId = match?.id ?? null;
        }
        if (!resolvedGateId) orphanWeeks.push(week.week_number);
        const { error: weekError } = await supabase.from('program_weeks').insert({
          program_id: programId,
          gate_id: resolvedGateId,
          week_number: week.week_number,
          title: week.title,
          description: week.description || null,
          deliverables_json: week.deliverables_json || [],
        });
        if (weekError) {
          throw new Error(`Failed to create week ${week.week_number} "${week.title}": ${weekError.message}`);
        }
      }
      if (orphanWeeks.length) {
        console.warn(`[publish-program-setup] Orphan weeks (no gate match): ${orphanWeeks.join(', ')}`);
      }
      console.log(`[publish-program-setup] Created ${draftData.weeks?.length || 0} weeks`);
    }

    // 3-7. Stage-side artifacts (KPIs, core KPIs, playbooks, alerts, health)
    // are only meaningful for incubation programs. Skip for acceleration so
    // we don't reintroduce stage_kpi_defaults/playbooks we just quarantined.
    const kpiDefinitionMap: Record<string, string> = {}; // name -> id
    if (!isAccelerationFinal) {

    // First pass: ensure all KPI definitions exist
    for (const stageKpis of draftData.kpis || []) {
      for (const kpi of stageKpis.kpis) {
        if (kpi.kpi_definition_id) {
          kpiDefinitionMap[kpi.name] = kpi.kpi_definition_id;
        } else {
          // Check if KPI definition exists by name
          const { data: existingDef } = await supabase
            .from('kpi_definitions')
            .select('id')
            .eq('name', kpi.name)
            .single();

          if (existingDef) {
            kpiDefinitionMap[kpi.name] = existingDef.id;
          } else {
            // Create new KPI definition
            const { data: newDef, error: defError } = await supabase
              .from('kpi_definitions')
              .insert({
                name: kpi.name,
                unit: kpi.unit || null,
                category: kpi.category || null,
                description: kpi.description || null,
                direction: kpi.direction || 'up',
                is_global: false,
                program_id: programId,
              })
              .select()
              .single();

            if (defError || !newDef) {
              console.error(`[publish-program-setup] Failed to create KPI definition: ${kpi.name}`, defError);
              continue;
            }
            kpiDefinitionMap[kpi.name] = newDef.id;
          }
        }
      }
    }
    console.log(`[publish-program-setup] Processed ${Object.keys(kpiDefinitionMap).length} KPI definitions`);

    // Second pass: upsert stage_kpi_defaults
    // First, remove existing defaults for this program
    await supabase
      .from('stage_kpi_defaults')
      .delete()
      .eq('program_id', programId);

    for (const stageKpis of draftData.kpis || []) {
      for (const kpi of stageKpis.kpis) {
        const kpiDefId = kpiDefinitionMap[kpi.name];
        if (!kpiDefId) continue;

        await supabase.from('stage_kpi_defaults').insert({
          program_id: programId,
          stage: stageKpis.stage_key,
          kpi_definition_id: kpiDefId,
          required: kpi.is_required,
          order_index: kpi.order_index,
          target_value: kpi.target_value || null,
        });
      }
    }
    console.log(`[publish-program-setup] Upserted stage KPI defaults`);

    // 4. Upsert core KPIs
    await supabase.from('program_core_kpis').delete().eq('program_id', programId);
    
    for (const coreKpi of draftData.coreKpis || []) {
      const kpiDefId = coreKpi.kpi_definition_id || kpiDefinitionMap[coreKpi.name];
      if (!kpiDefId) continue;

      await supabase.from('program_core_kpis').insert({
        program_id: programId,
        kpi_definition_id: kpiDefId,
        order_index: coreKpi.order_index,
      });
    }
    console.log(`[publish-program-setup] Upserted ${draftData.coreKpis?.length || 0} core KPIs`);

    // 5. Upsert playbooks
    for (const playbook of draftData.playbooks || []) {
      // Check if playbook exists for this stage
      const { data: existingPlaybook } = await supabase
        .from('playbooks')
        .select('id')
        .eq('program_id', programId)
        .eq('stage', playbook.stage_key)
        .single();

      let playbookId: string;
      if (existingPlaybook) {
        await supabase
          .from('playbooks')
          .update({
            title: playbook.title,
            description: playbook.description,
            is_active: true,
          })
          .eq('id', existingPlaybook.id);
        playbookId = existingPlaybook.id;

        // Delete existing items (will recreate)
        await supabase.from('playbook_items').delete().eq('playbook_id', playbookId);
      } else {
        const { data: newPlaybook, error: pbError } = await supabase
          .from('playbooks')
          .insert({
            program_id: programId,
            stage: playbook.stage_key,
            title: playbook.title,
            description: playbook.description,
            is_active: true,
          })
          .select()
          .single();

        if (pbError || !newPlaybook) {
          console.error(`[publish-program-setup] Failed to create playbook`, pbError);
          continue;
        }
        playbookId = newPlaybook.id;
      }

      // Create playbook items
      for (const item of playbook.items || []) {
        await supabase.from('playbook_items').insert({
          playbook_id: playbookId,
          item_type: item.item_type,
          title: item.title,
          description: item.description,
          relative_due_days: item.relative_due_days,
          priority: item.priority,
          order_index: item.order_index,
          default_owner_role: item.default_owner_role,
          metadata_json: item.metadata_json || {},
        });
      }
    }
    console.log(`[publish-program-setup] Upserted ${draftData.playbooks?.length || 0} playbooks`);

    // 6. Upsert alert rules
    await supabase.from('program_alert_rules').delete().eq('program_id', programId);
    
    for (const rule of draftData.alertRules || []) {
      await supabase.from('program_alert_rules').insert({
        program_id: programId,
        rule_type: rule.rule_type,
        threshold: rule.threshold,
        severity: rule.severity,
        is_enabled: rule.is_enabled,
      });
    }
    console.log(`[publish-program-setup] Upserted ${draftData.alertRules?.length || 0} alert rules`);

    // 7. Upsert health model
    if (draftData.healthModel) {
      const { data: existingModel } = await supabase
        .from('program_health_model')
        .select('id')
        .eq('program_id', programId)
        .single();

      if (existingModel) {
        await supabase
          .from('program_health_model')
          .update({
            weights_json: draftData.healthModel.weights_json,
            thresholds_json: draftData.healthModel.thresholds_json,
            is_enabled: draftData.healthModel.is_enabled,
          })
          .eq('id', existingModel.id);
      } else {
        await supabase.from('program_health_model').insert({
          program_id: programId,
          weights_json: draftData.healthModel.weights_json,
          thresholds_json: draftData.healthModel.thresholds_json,
          is_enabled: draftData.healthModel.is_enabled,
        });
      }
      console.log(`[publish-program-setup] Upserted health model`);
    }

    // 8. FINAL STEP — flip program to active and mark draft published.
    // This is intentionally last so a partial failure leaves the program in
    // 'draft' status (not visible to founders) and the catch block can mark
    // the wizard draft as 'publish_failed' for staff remediation.
    const { error: activateErr } = await supabase
      .from('programs')
      .update({ status: 'active', is_active: true, updated_at: new Date().toISOString() })
      .eq('id', programId);
    if (activateErr) throw new Error(`Failed to activate program: ${activateErr.message}`);

    const { error: draftErr } = await supabase
      .from('program_setup_drafts')
      .update({ status: 'published', program_id: programId })
      .eq('id', draft_id);
    if (draftErr) throw new Error(`Failed to mark draft published: ${draftErr.message}`);

    // Log activity with full audit metadata (program_type, gates/weeks/playbook/kpi counts)
    await supabase.from('activity_log').insert({
      user_id: user.id,
      entity_type: 'program',
      entity_id: programId,
      action: draft.program_id ? 'updated' : 'created',
      metadata: {
        via: 'setup_wizard',
        draft_id: draft_id,
        program_type: programTypeFinal,
        stages_count: (draftData.stages?.filter(s => s.is_active) || []).length,
        gates_count: (draftData.gates || []).length,
        weeks_count: (draftData.weeks || []).length,
        playbooks_count: (draftData.playbooks || []).length,
        kpi_count: Object.keys(kpiDefinitionMap).length,
        alert_rules_count: (draftData.alertRules || []).length,
        health_model_enabled: !!draftData.healthModel?.is_enabled,
      },
    });

    console.log(`[publish-program-setup] Successfully published program ${programId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      program_id: programId,
      message: 'Program published successfully'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Internal server error';
    console.error('[publish-program-setup] Error:', errMsg);

    // Best-effort rollback marker — keep program in 'draft' (already not active)
    // and mark the wizard draft as 'publish_failed' so staff sees the failure.
    try {
      const reqBody = await req.clone().json().catch(() => ({}));
      if (reqBody?.draft_id) {
        await supabase
          .from('program_setup_drafts')
          .update({ status: 'publish_failed' as any, last_publish_error: errMsg } as any)
          .eq('id', reqBody.draft_id);
      }
    } catch (_) { /* non-fatal */ }

    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});