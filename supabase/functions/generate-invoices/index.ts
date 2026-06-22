/**
 * Generate Invoices Edge Function
 * Auto-generates monthly invoices from active contracts using canonical pricing.
 * Derives line items from:
 * 1. Canonical pricing table (pricing_lines) for the active version
 * 2. Contract-specific discounts (non-cumulative best-of rule)
 * 3. Complementary services linked to the contract
 * 
 * Called by cron (day 1 at 07:00) or manually from backoffice.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizeLocale, pickLang, type Locale } from '../_shared/i18n.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAT_RATE = 0.23

const INV_STRINGS = {
  monthlyFee: { pt: 'Mensalidade de incubação', en: 'Incubation monthly fee' },
  contractDiscount: { pt: 'Desconto contratual', en: 'Contractual discount' },
  startupPortugalStatus: { pt: 'Estatuto Startup Portugal', en: 'Startup Portugal status' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Auth: allow cron (with secret) or authenticated staff
    const authHeader = req.headers.get('Authorization')
    let isCron = false

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const cronSecret = Deno.env.get('CRON_SECRET')
      
      if (token === cronSecret) {
        isCron = true
      } else {
        const { data: { user }, error } = await supabase.auth.getUser(token)
        if (error || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'consultor', 'backoffice'])
        
        if (!roles?.length) {
          return new Response(JSON.stringify({ error: 'Staff only' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const targetMonth = body.targetMonth || new Date().toISOString().slice(0, 7)
    const dryRun = body.dryRun === true

    const [year, month] = targetMonth.split('-').map(Number)

    // Fetch the current pricing table version + pricing lines
    const { data: currentVersion } = await supabase
      .from('pricing_table_versions')
      .select('id, version_code')
      .eq('is_current', true)
      .single()

    let pricingLines: any[] = []
    if (currentVersion) {
      const { data: lines } = await supabase
        .from('pricing_lines')
        .select('*')
        .eq('pricing_version_id', currentVersion.id)
      pricingLines = lines || []
    }

    // Fetch all active contracts with incubation type and startup info
    const { data: contracts, error: contractsError } = await supabase
      .from('startup_contracts')
      .select(`
        id, workspace_id, contract_number, monthly_fee, currency,
        billing_day, payment_terms_days, discount_percentage,
        start_date, end_date, status, incubation_type_id,
        square_meters,
        workspace:workspaces(id, startup:startups(name, has_startup_portugal_status))
      `)
      .eq('status', 'active')

    if (contractsError) throw contractsError

    const results: Array<{ contractId: string; invoiceNumber: string; total: number; status: string }> = []
    const errors: Array<{ contractId: string; error: string }> = []

    for (const contract of contracts || []) {
      try {
        const contractStart = new Date(contract.start_date)
        const periodStart = new Date(year, month - 1, 1)
        const periodEnd = new Date(year, month, 0)
        
        if (contractStart > periodEnd) continue
        if (contract.end_date && new Date(contract.end_date) < periodStart) continue

        const invoiceNumber = `INV-${targetMonth.replace('-', '')}-${contract.contract_number || contract.id.slice(0, 6)}`
        
        // Check if invoice already exists
        const { data: existing } = await supabase
          .from('invoices')
          .select('id')
          .eq('contract_id', contract.id)
          .gte('issue_date', `${targetMonth}-01`)
          .lt('issue_date', month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`)
          .limit(1)

        if (existing?.length) {
          results.push({ contractId: contract.id, invoiceNumber, total: 0, status: 'skipped_exists' })
          continue
        }

        // ═══ CANONICAL PRICING RESOLUTION ═══
        // 1. Find matching pricing line from the official table
        let baseFee = contract.monthly_fee
        let baseFeeSource = 'contract_monthly_fee'
        let billingFrequency = 'monthly'
        const monthsActive = Math.floor((periodStart.getTime() - contractStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
        const incubationYear = Math.max(1, Math.floor(monthsActive / 12) + 1)

        if (pricingLines.length && contract.incubation_type_id) {
          const matchingLines = pricingLines.filter(
            (l: any) => l.incubation_type_id === contract.incubation_type_id
          )

          let matchedLine: any = null
          if (matchingLines.length === 1) {
            matchedLine = matchingLines[0]
          } else if (matchingLines.length > 1 && contract.square_meters) {
            matchedLine = matchingLines.find((l: any) => l.area_sqm === contract.square_meters)
              || matchingLines.sort((a: any, b: any) =>
                Math.abs((a.area_sqm || 0) - contract.square_meters) -
                Math.abs((b.area_sqm || 0) - contract.square_meters)
              )[0]
          } else if (matchingLines.length > 0) {
            matchedLine = matchingLines[0]
          }

          if (matchedLine) {
            billingFrequency = matchedLine.billing_frequency || 'monthly'

            if (matchedLine.is_per_sqm && contract.square_meters) {
              baseFee = matchedLine.startup_monthly_fee * contract.square_meters
            } else {
              baseFee = matchedLine.startup_monthly_fee
            }
            baseFeeSource = `pricing_line:${matchedLine.designation}`

            // Apply year 4+ annual increase
            if (incubationYear > 3 && matchedLine.startup_annual_increase_pct) {
              const yearsOver = incubationYear - 3
              baseFee = Math.round(baseFee * Math.pow(1 + matchedLine.startup_annual_increase_pct / 100, yearsOver) * 100) / 100
            }
          }
        }

        // 2. Resolve non-cumulative discount (best-of)
        const { data: discounts } = await supabase
          .from('contract_discounts')
          .select('discount_percentage, reason')
          .eq('contract_id', contract.id)
          .lte('start_date', periodEnd.toISOString())
          .or(`end_date.is.null,end_date.gte.${periodStart.toISOString()}`)

        const contractDiscount = discounts?.reduce((max, d) => 
          Math.max(max, d.discount_percentage), 0) || 0

        // Also check startup-level automatic discounts
        const startup = (contract.workspace as any)?.startup
        let autoDiscount = 0
        let autoDiscountReason = ''
        if (startup?.has_startup_portugal_status) {
          autoDiscount = 5
          autoDiscountReason = 'Estatuto Startup Portugal'
        }
        // Note: associate status would give 10% but requires checking a flag we don't store yet
        // The non-cumulative rule picks the highest
        const effectiveDiscount = Math.max(contractDiscount, contract.discount_percentage || 0, autoDiscount)
        const discountReason = effectiveDiscount === autoDiscount && autoDiscount > 0
          ? autoDiscountReason
          : discounts?.find(d => d.discount_percentage === effectiveDiscount)?.reason || 'Desconto contratual'

        const subtotal = Math.round(baseFee * (1 - effectiveDiscount / 100) * 100) / 100
        const taxAmount = Math.round(subtotal * VAT_RATE * 100) / 100
        const total = Math.round((subtotal + taxAmount) * 100) / 100

        // 3. Build line items
        const lineItems: any[] = [{
          description: `Mensalidade de incubação — ${new Date(year, month - 1).toLocaleString('pt-PT', { month: 'long', year: 'numeric' })}`,
          quantity: 1,
          unit_price: baseFee,
          discount_percentage: effectiveDiscount,
          discount_reason: effectiveDiscount > 0 ? discountReason : undefined,
          amount: subtotal,
          source: baseFeeSource,
          pricing_version: currentVersion?.version_code || 'unknown',
          incubation_year: incubationYear,
        }]

        const billingDay = Math.min(contract.billing_day || 1, periodEnd.getDate())
        const issueDate = `${targetMonth}-${String(billingDay).padStart(2, '0')}`
        const dueDate = new Date(new Date(issueDate).getTime() + (contract.payment_terms_days || 30) * 86400000)
          .toISOString().split('T')[0]

        if (dryRun) {
          results.push({ contractId: contract.id, invoiceNumber, total, status: 'would_create' })
          continue
        }

        const { error: insertError } = await supabase
          .from('invoices')
          .insert({
            contract_id: contract.id,
            workspace_id: contract.workspace_id,
            invoice_number: invoiceNumber,
            issue_date: issueDate,
            due_date: dueDate,
            subtotal,
            tax_rate: VAT_RATE * 100,
            tax_amount: taxAmount,
            total,
            currency: contract.currency || 'EUR',
            status: 'draft',
            line_items: lineItems,
          })

        if (insertError) throw insertError

        results.push({ contractId: contract.id, invoiceNumber, total, status: 'created' })

      } catch (err) {
        errors.push({ contractId: contract.id, error: (err as Error).message })
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const skipped = results.filter(r => r.status === 'skipped_exists').length

    return new Response(JSON.stringify({
      success: true,
      targetMonth,
      dryRun,
      pricingVersion: currentVersion?.version_code || 'none',
      summary: {
        totalContracts: contracts?.length || 0,
        created,
        skipped,
        errors: errors.length,
      },
      results,
      errors: errors.length ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Invoice generation error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
