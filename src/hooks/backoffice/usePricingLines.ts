/**
 * Backoffice hooks - Pricing Lines domain
 * Fetches canonical pricing lines from the official versioned pricing table.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface PricingLineRow {
  id: string;
  pricing_version_id: string;
  designation: string;
  startup_monthly_fee: number;
  non_startup_monthly_fee: number | null;
  area_sqm: number | null;
  location_type: string | null;
  is_per_sqm: boolean;
  is_post_incubation: boolean;
  billing_frequency: string;
  max_duration_months: number | null;
  startup_annual_increase_pct: number | null;
  non_startup_annual_increase_pct: number | null;
  incubation_type_id: string | null;
  services_description: string | null;
  notes: string | null;
  sort_order: number;
}

export interface PricingTableVersion {
  id: string;
  version_code: string;
  effective_date: string;
  is_current: boolean;
  regulation_reference: string | null;
  notes: string | null;
}

export interface ComplementaryServiceRow {
  id: string;
  pricing_version_id: string;
  name: string;
  category: string;
  unit_price: number | null;
  unit: string | null;
  is_included: boolean;
  description: string | null;
  sort_order: number;
}

/**
 * Fetch the current active pricing table version + its lines
 */
export function useCurrentPricingTable() {
  return useQuery({
    queryKey: ['current-pricing-table'],
    queryFn: async () => {
      // Get the current version — fresh tenants may have none yet, so degrade gracefully.
      const { data: version, error: versionError } = await supabase
        .from('pricing_table_versions')
        .select('*')
        .eq('is_current', true)
        .maybeSingle();
      if (versionError) throw versionError;
      if (!version) {
        return {
          version: null as PricingTableVersion | null,
          lines: [] as PricingLineRow[],
          services: [] as ComplementaryServiceRow[],
        };
      }

      // Get all pricing lines for this version
      const { data: lines, error: linesError } = await supabase
        .from('pricing_lines')
        .select('*')
        .eq('pricing_version_id', version.id)
        .order('sort_order', { ascending: true });
      if (linesError) throw linesError;

      // Get complementary services
      const { data: services, error: servicesError } = await supabase
        .from('complementary_services')
        .select('*')
        .eq('pricing_version_id', version.id)
        .order('sort_order', { ascending: true });
      if (servicesError) throw servicesError;

      return {
        version: version as PricingTableVersion,
        lines: (lines || []) as PricingLineRow[],
        services: (services || []) as ComplementaryServiceRow[],
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - pricing data changes rarely
  });
}

/**
 * Find the matching pricing line for a given incubation type + area
 */
export function findMatchingPricingLine(
  lines: PricingLineRow[],
  incubationTypeId: string | null,
  areaSqm: number | null,
): PricingLineRow | null {
  if (!lines.length) return null;

  // First try to match by incubation_type_id
  if (incubationTypeId) {
    const byType = lines.filter(l => l.incubation_type_id === incubationTypeId);
    if (byType.length === 1) return byType[0];

    // If multiple lines for this type (e.g. physical offices), match by area
    if (byType.length > 1 && areaSqm) {
      // Find exact area match first
      const exactMatch = byType.find(l => l.area_sqm === areaSqm);
      if (exactMatch) return exactMatch;

      // Find closest area match
      const sorted = byType
        .filter(l => l.area_sqm != null)
        .sort((a, b) => Math.abs((a.area_sqm || 0) - areaSqm) - Math.abs((b.area_sqm || 0) - areaSqm));
      if (sorted.length) return sorted[0];
    }

    // Return the first match by type
    if (byType.length) return byType[0];
  }

  return null;
}

/**
 * Calculate the incubation year from contract start date
 */
export function getIncubationYear(contractStartDate: string): number {
  const start = new Date(contractStartDate);
  const now = new Date();
  const months = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(1, Math.floor(months / 12) + 1);
}
