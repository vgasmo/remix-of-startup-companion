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

/**
 * Envia ao founder criado agora o email de acesso (definir password).
 * O cliente de auth é PKCE: o link usa o hashed_token e é validado em /reset-password com verifyOtp.
 * Best-effort: nunca lança e devolve false se não enviou.
 */
async function sendFounderAccessEmail(supabase: any, email: string, fullName: string): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return false
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://fb.startupleiria.com'
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'recovery', email })
  const hashed: string | undefined = link?.properties?.hashed_token
  if (linkErr || !hashed) {
    console.warn('[founderAccount] generateLink failed:', linkErr?.message)
    return false
  }
  const accessUrl = `${appUrl}/reset-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`
  const safeName = fullName.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Startup Leiria <noreply@startupleiria.com>',
        to: [email],
        subject: 'A sua conta na plataforma Startup Leiria',
        html: `<p>Olá ${safeName},</p><p>O contrato foi assinado e a sua conta na plataforma Startup Leiria já está criada.</p><p><a href='${accessUrl}'>Definir a minha password</a></p><p>Se o link expirar, use «Esqueci-me da password» em ${appUrl}/login com este email.</p>`,
      }),
    })
    if (!res.ok) console.warn('[founderAccount] access email failed:', res.status, await res.text())
    return res.ok
  } catch (e) {
    // fetch lança em erro de rede
    console.warn('[founderAccount] access email failed:', String(e))
    return false
  }
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
    let createdNow = false
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
      createdNow = true
    }

    // Conta existente: nunca reativar uma conta suspensa (só o admin reativa, P1.1/P2.1).
    // Os chamadores abrem a triagem 'Convidar founder' quando ok=false; o staff decide.
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', userId)
      .maybeSingle()
    if (currentProfile?.account_status === 'suspended') {
      return { ok: false, userId, reason: 'account_suspended' }
    }

    // Garantir o perfil (a conta pode ser anterior ao trigger on_auth_user_created) sem reescrever
    // o nome de um perfil existente, e aprovar só contas pendentes.
    await supabase
      .from('profiles')
      .upsert(
        { id: userId, email, full_name: fullName, account_status: 'approved' },
        { onConflict: 'id', ignoreDuplicates: true },
      )
    await supabase
      .from('profiles')
      .update({ account_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('account_status', 'pending')

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

    // Fechar a triagem 'Convidar founder' que o reconcile_contract_founders abriu (trigger ao ativar/ligar
    // o contrato) antes de a conta existir. Só a 'missing_auth_user': a de 'access_email_failed' fica aberta.
    await supabase
      .from('staff_work_queue_items')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('workspace_id', contract.workspace_id)
      .eq('type', 'triage')
      .in('status', ['open', 'in_progress'])
      .contains('evidence_json', { purpose: 'invite_founder', contract_id: contract.id, reason: 'missing_auth_user' })

    // Conta criada agora: o founder ainda não tem password, enviar-lhe o acesso.
    // Se o email falhar, o staff recebe a triagem para enviar o acesso à mão.
    if (createdNow) {
      const sent = await sendFounderAccessEmail(supabase, email, fullName)
      if (!sent) await enqueueFounderInviteTask(supabase, contract, 'access_email_failed')
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
