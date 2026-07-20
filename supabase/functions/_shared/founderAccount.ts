/**
 * Shared: Auto-create founder account after contract signing.
 * Used by docusign-webhook, pandadoc-webhook, and public-contract-onboarding
 * (digital_sign + manual mark-as-signed) so all signing paths behave the same.
 *
 * On failure, callers should enqueue a staff work-queue item so the founder
 * account creation is never silently dropped.
 */

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

export type FounderContractInput = {
  id: string
  workspace_id: string | null
  legal_representative_email: string | null
  legal_representative_name: string | null
}

export type FounderAccountResult = {
  ok: boolean
  userId?: string
  reason?: string
  error?: string
}

export async function autoCreateFounderAccount(
  supabase: any,
  contract: FounderContractInput,
): Promise<FounderAccountResult> {
  if (!contract.legal_representative_email) {
    return { ok: false, reason: 'missing_email' }
  }
  if (!contract.workspace_id) {
    return { ok: false, reason: 'missing_workspace' }
  }

  const email = contract.legal_representative_email.toLowerCase().trim()
  const fullName = contract.legal_representative_name || 'Founder'

  try {
    // Paginated lookup: listUsers() defaults to 50 rows per page. Iterate
    // until we find the email or exhaust results, so pre-existing auth
    // accounts are always detected (otherwise createUser throws email_exists
    // and we lose the link between the auth user and the workspace).
    let existingUser: any = null;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users || [];
      existingUser = users.find((u: any) => u.email?.toLowerCase() === email);
      if (existingUser) break;
      if (users.length < 200) break;
    }

    let userId: string
    if (existingUser) {
      userId = existingUser.id
    } else {
      const tempPassword = generateSecurePassword()
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          selected_role: 'founder',
          auto_created: true,
          contract_id: contract.id,
        },
      })
      if (createErr) throw createErr
      userId = newUser.user.id

      try {
        await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: {
            redirectTo: `${Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com'}/reset-password`,
          },
        })
      } catch (linkErr) {
        console.warn('[founderAccount] recovery link failed (non-fatal):', linkErr)
      }
    }


    await supabase
      .from('user_roles')
      .upsert({ user_id: userId, role: 'founder' }, { onConflict: 'user_id,role' })

    await supabase
      .from('workspace_users')
      .upsert(
        { workspace_id: contract.workspace_id, user_id: userId, role: 'founder', active: true },
        { onConflict: 'workspace_id,user_id' },
      )

    const { data: ws } = await supabase
      .from('workspaces')
      .select('status')
      .eq('id', contract.workspace_id)
      .single()

    if (ws && ['pending', 'imported_unclaimed', 'draft'].includes(ws.status)) {
      await supabase
        .from('workspaces')
        .update({ status: 'claimed', updated_at: new Date().toISOString() })
        .eq('id', contract.workspace_id)
    }

    return { ok: true, userId }
  } catch (err: any) {
    console.error('[founderAccount] failed:', err)
    return { ok: false, reason: 'exception', error: String(err?.message || err) }
  }
}

/**
 * Enqueue a staff work-queue item when auto-creation fails or skips,
 * so a founder without an account is never silently lost.
 */
export async function enqueueFounderInviteTask(
  supabase: any,
  contract: FounderContractInput,
  reason: string,
) {
  try {
    if (!contract.workspace_id) return
    await supabase.from('staff_work_queue_items').insert({
      workspace_id: contract.workspace_id,
      type: 'triage',
      title: `Convidar founder — ${contract.legal_representative_name || contract.legal_representative_email || contract.id.slice(0, 8)}`,
      description: `Auto-criação de conta falhou (${reason}). Convite manual necessário.`,
      priority: 'high',
      status: 'open',
      evidence_json: {
        purpose: 'invite_founder',
        contract_id: contract.id,
        reason,
        email: contract.legal_representative_email,
      },
    })
  } catch (err) {
    console.warn('[founderAccount] enqueue work-queue failed (non-fatal):', err)
  }
}

