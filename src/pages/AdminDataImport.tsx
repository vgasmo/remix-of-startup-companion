import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { parseExcelToJson } from '@/lib/excelParser';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, FileSpreadsheet, PlayCircle, CheckCircle2, AlertTriangle, 
  Download, Trash2, RefreshCw, Shield, ArrowRight, ArrowLeft, Info, 
  Search, ExternalLink, Building2, Mail, Phone, Hash
} from 'lucide-react';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';

// ====================
// TYPES
// ====================

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  // Normalized fields
  organization_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  vat_number: string;
  building: string;
  service: string;
  sector: string;
  deal_type: string; // Tipo de negócio (Virtual, Fisico, Ideias)
  deal_stage: string; // Etapa do negócio (Tier A/B/C, Onboarding)
  owner_name: string; // Proprietário do negócio
  associated_company: string;
  department: string;
  deal_id: string;
  contact_id: string;
  company_id: string;
  // Resolved
  resolved_owner_id: string | null;
  resolved_stage: string | null;
  resolved_building_id: string | null;
  resolved_incubation_type_id: string | null;
  // Validation
  isValid: boolean;
  validationErrors: string[];
  // Dedup
  isDuplicate: boolean;
  duplicateOf?: string;
  matchReason?: string;
}

interface ImportConfig {
  program_id: string;
  default_stage: string;
  owner_consultant_id: string;
  use_file_owner: boolean; // Use owner from file if available
  use_file_stage: boolean; // Use stage from file if available
  upsert_mode: boolean;
  create_workspaces: boolean;
  create_draft_contracts: boolean; // Create draft contracts from building/service data
  allow_stage_update: boolean;
}

interface DryRunResult {
  would_insert: number;
  would_update: number;
  skipped_invalid: number;
  skipped_duplicate: number;
  details: Array<{
    rowIndex: number;
    name: string;
    action: 'insert' | 'update' | 'skip_invalid' | 'skip_duplicate';
    reason?: string;
  }>;
}

interface ImportResult {
  inserted: number;
  updated: number;
  errors: Array<{ rowIndex: number; name: string; error: string }>;
}

// ====================
// NORMALIZATION UTILS
// ====================

function normalizeVat(vat: string): string {
  if (!vat) return '';
  return vat.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function normalizeEmail(email: string): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

function normalizeOrgName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,?\s*(lda|ltda|s\.?a\.?|unipessoal|limitada|sociedade|empresa|inc|llc|ltd|gmbh|srl|sl|sarl)\.?$/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStringValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    // Check exact key
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return String(row[key]).trim();
    }
    // Check case-insensitive
    const lowerKey = key.toLowerCase();
    for (const rowKey of Object.keys(row)) {
      if (rowKey.toLowerCase() === lowerKey && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
        return String(row[rowKey]).trim();
      }
    }
  }
  return '';
}

// ====================
// MAIN COMPONENT
// ====================

export default function AdminDataImport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, isConsultor } = useAuth();
  const { data: programs } = usePrograms();
  const { data: consultors } = useConsultors();
  
  // Load buildings and incubation types for contract creation
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [incubationTypes, setIncubationTypes] = useState<Array<{ id: string; name: string; contract_type: string; base_monthly_fee: number }>>([]);
  
  useEffect(() => {
    const loadLookupData = async () => {
      const [buildingsRes, typesRes] = await Promise.all([
        supabase.from('buildings').select('id, name, code').order('name'),
        supabase.from('incubation_types').select('id, name, contract_type, base_monthly_fee').eq('is_active', true).order('sort_order'),
      ]);
      if (buildingsRes.data) setBuildings(buildingsRes.data);
      if (typesRes.data) setIncubationTypes(typesRes.data);
    };
    loadLookupData();
  }, []);

  // State
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('');
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [config, setConfig] = useState<ImportConfig>({
    program_id: '',
    default_stage: 'new',
    owner_consultant_id: '',
    use_file_owner: true, // Default: use owner from file
    use_file_stage: true, // Default: use stage from file
    upsert_mode: true,
    create_workspaces: false,
    create_draft_contracts: true, // Default: create draft contracts
    allow_stage_update: false,
  });

  const [safetyChecks, setSafetyChecks] = useState({
    understood_dry_run: false,
    backup_exists: false,
    program_confirmed: false,
  });

  // ====================
  // CONSULTANT LOOKUP & MAPPING
  // ====================

  // Build consultant lookup map
  const consultorLookup = useMemo(() => {
    const map = new Map<string, string>();
    consultors?.forEach(c => {
      if (c.full_name) {
        map.set(c.full_name.toLowerCase().trim(), c.id);
        const firstName = c.full_name.split(' ')[0].toLowerCase().trim();
        if (firstName && !map.has(firstName)) {
          map.set(firstName, c.id);
        }
      }
    });
    return map;
  }, [consultors]);

  const mapHubSpotStage = (hubspotStage: string): string | null => {
    if (!hubspotStage) return null;
    const stage = hubspotStage.toLowerCase().trim();
    // Map all qualified/tier leads to contracted
    if (stage.includes('tier a')) return 'contracted';
    if (stage.includes('tier b')) return 'contracted';
    if (stage.includes('tier c')) return 'contracted';
    if (stage.includes('qualified')) return 'contracted';
    if (stage.includes('onboarding')) return 'met';
    if (stage.includes('first contact') || stage.includes('primeiro contacto')) return 'first_contact_booked';
    if (stage.includes('new') || stage.includes('novo')) return 'new';
    if (stage.includes('lost') || stage.includes('perdido')) return 'lost';
    if (stage.includes('contracted') || stage.includes('contratado')) return 'contracted';
    return null;
  };

  // Build building lookup map (name/code -> id)
  const buildingLookup = useMemo(() => {
    const map = new Map<string, string>();
    buildings.forEach(b => {
      map.set(b.name.toLowerCase().trim(), b.id);
      map.set(b.code.toLowerCase().trim(), b.id);
      // Also add variants
      if (b.name.includes(' - ')) {
        const shortName = b.name.split(' - ')[0].toLowerCase().trim();
        if (!map.has(shortName)) map.set(shortName, b.id);
      }
    });
    // Add common aliases
    map.set('comum', buildings.find(b => b.name.toLowerCase().includes('leiria') || b.code === 'LEIRIA')?.id || '');
    map.set('inc. social', buildings.find(b => b.code === 'SOCIAL')?.id || '');
    return map;
  }, [buildings]);

  // Build incubation type lookup map (name/contract_type -> object)
  const incubationTypeLookup = useMemo(() => {
    const map = new Map<string, { id: string; base_monthly_fee: number }>();
    incubationTypes.forEach(t => {
      map.set(t.name.toLowerCase().trim(), { id: t.id, base_monthly_fee: t.base_monthly_fee });
      map.set(t.contract_type.toLowerCase().trim(), { id: t.id, base_monthly_fee: t.base_monthly_fee });
    });
    // Add common aliases from file
    map.set('incubação virtual', map.get('incubação virtual') || { id: '', base_monthly_fee: 0 });
    map.set('incubação física', map.get('desk') || map.get('escritório standard') || { id: '', base_monthly_fee: 0 });
    map.set('domiciliação', map.get('domiciliação') || { id: '', base_monthly_fee: 0 });
    map.set('incubação de ideias', map.get('incubação virtual') || { id: '', base_monthly_fee: 0 });
    return map;
  }, [incubationTypes]);

  const resolveBuilding = useCallback((buildingName: string): string | null => {
    if (!buildingName) return null;
    const normalized = buildingName.toLowerCase().trim();
    if (buildingLookup.has(normalized)) return buildingLookup.get(normalized) || null;
    // Try partial match
    for (const [name, id] of buildingLookup.entries()) {
      if (name.includes(normalized) || normalized.includes(name)) return id;
    }
    return null;
  }, [buildingLookup]);

  const resolveIncubationType = useCallback((serviceName: string): { id: string; base_monthly_fee: number } | null => {
    if (!serviceName) return null;
    const normalized = serviceName.toLowerCase().trim();
    if (incubationTypeLookup.has(normalized)) return incubationTypeLookup.get(normalized) || null;
    // Try partial match
    for (const [name, data] of incubationTypeLookup.entries()) {
      if (name.includes(normalized) || normalized.includes(name)) return data;
    }
    return null;
  }, [incubationTypeLookup]);

  const resolveOwner = useCallback((ownerName: string): string | null => {
    if (!ownerName) return null;
    const normalized = ownerName.toLowerCase().trim();
    if (consultorLookup.has(normalized)) return consultorLookup.get(normalized) || null;
    const firstName = normalized.split(' ')[0];
    if (consultorLookup.has(firstName)) return consultorLookup.get(firstName) || null;
    for (const [name, id] of consultorLookup.entries()) {
      if (name.includes(normalized) || normalized.includes(name)) return id;
    }
    return null;
  }, [consultorLookup]);

  const parseAndValidateRows = useCallback((rows: Record<string, unknown>[]): ParsedRow[] => {
    const parsed: ParsedRow[] = [];
    const seenVats = new Map<string, number>();
    const seenEmails = new Map<string, number>();
    const seenNames = new Map<string, number>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const validationErrors: string[] = [];

      // Extract fields with multiple possible column names
      const organization_name = getStringValue(row, [
        'Nome', 'Nome da empresa', 'organization_name', 'Company', 'Empresa',
        'Nome do negócio', 'Deal Name', 'Negócio', 'Nome Empresa', 'company_name',
        'Associated Company'
      ]);
      
      // Parse Associated Contact: "Name (email)" format
      const associatedContact = getStringValue(row, ['Associated Contact']);
      let contact_name = getStringValue(row, [
        'Contacto', 'Contact', 'contact_name', 'Nome do contacto', 'Contact Name',
        'Nome Contacto', 'Pessoa', 'Person'
      ]);
      let contact_email = getStringValue(row, [
        'Email', 'E-mail', 'email', 'contact_email', 'Email Final', 'email_final',
        'Email do contacto', 'Contact Email', 'E-Mail', 'email_address'
      ]);
      
      // Parse "Name (email)" format from Associated Contact
      if (associatedContact) {
        const match = associatedContact.match(/^(.+?)\s*\(([^)]+)\)/);
        if (match) {
          if (!contact_name) contact_name = match[1].trim();
          if (!contact_email) contact_email = match[2].trim();
        } else if (!contact_name) {
          contact_name = associatedContact;
        }
      }
      
      const contact_phone = getStringValue(row, [
        'Telefone', 'Phone', 'phone', 'contact_phone', 'Telemóvel', 'Tel', 'Mobile',
        'Número de telefone', 'Phone Number'
      ]);
      const vat_number = getStringValue(row, [
        'NIF', 'VAT', 'nif', 'vat_number', 'NIPC', 'Número fiscal', 'Tax ID',
        'Contribuinte', 'NIF/NIPC', 'VAT Number', 'Número de contribuinte'
      ]);
      const building = getStringValue(row, [
        'Edifício', 'Edificio', 'Building', 'building', 'Local', 'Location'
      ]);
      const service = getStringValue(row, [
        'Serviço', 'Servico', 'Service', 'service', 'Tipo de serviço'
      ]);
      const sector = getStringValue(row, [
        'Setor de atuação', 'Setor', 'Sector', 'Industry', 'Indústria'
      ]);
      const deal_type = getStringValue(row, [
        'Tipo de negócio', 'Deal Type', 'Business Type', 'Tipo'
      ]);
      const deal_stage = getStringValue(row, [
        'Etapa do negócio', 'Deal Stage', 'Stage', 'Etapa', 'Pipeline Stage'
      ]);
      const owner_name = getStringValue(row, [
        'Proprietário do negócio', 'Deal Owner', 'Owner', 'Proprietário', 'Assigned To'
      ]);
      const associated_company = getStringValue(row, [
        'Associated Company', 'Company', 'Empresa Associada'
      ]);
      const department = getStringValue(row, [
        'Departamento', 'Department', 'department', 'Area', 'Área'
      ]);
      const deal_id = getStringValue(row, [
        'Deal ID', 'deal_id', 'ID do negócio', 'HubSpot Deal ID', 'Record ID'
      ]);
      const contact_id = getStringValue(row, [
        'Contact ID', 'contact_id', 'ID do contacto', 'HubSpot Contact ID'
      ]);
      const company_id = getStringValue(row, [
        'Company ID', 'company_id', 'ID da empresa', 'HubSpot Company ID'
      ]);

      // Resolve owner from name
      const resolved_owner_id = resolveOwner(owner_name);
      
      // Resolve stage from HubSpot stage
      const resolved_stage = mapHubSpotStage(deal_stage);
      
      // Resolve building and incubation type for contract creation
      const resolved_building_id = resolveBuilding(building);
      const resolvedIncubationType = resolveIncubationType(service);
      const resolved_incubation_type_id = resolvedIncubationType?.id || null;

      // Validation
      if (!organization_name && !contact_email) {
        validationErrors.push(t('dataImport.noNameOrEmail', 'Missing organization name and email'));
      }

      // Deduplication within file
      let isDuplicate = false;
      let duplicateOf: string | undefined;
      let matchReason: string | undefined;

      const normalizedVat = normalizeVat(vat_number);
      const normalizedEmail = normalizeEmail(contact_email);
      const normalizedName = normalizeOrgName(organization_name);

      // Check VAT first (strongest match)
      if (normalizedVat && seenVats.has(normalizedVat)) {
        isDuplicate = true;
        duplicateOf = `Row ${seenVats.get(normalizedVat)! + 1}`;
        matchReason = `NIF: ${vat_number}`;
      }
      // Then email
      else if (normalizedEmail && seenEmails.has(normalizedEmail)) {
        isDuplicate = true;
        duplicateOf = `Row ${seenEmails.get(normalizedEmail)! + 1}`;
        matchReason = `Email: ${contact_email}`;
      }
      // Then normalized name
      else if (normalizedName && seenNames.has(normalizedName)) {
        isDuplicate = true;
        duplicateOf = `Row ${seenNames.get(normalizedName)! + 1}`;
        matchReason = `Name: ${organization_name}`;
      }

      // Track for dedup
      if (normalizedVat) seenVats.set(normalizedVat, i);
      if (normalizedEmail) seenEmails.set(normalizedEmail, i);
      if (normalizedName) seenNames.set(normalizedName, i);

      parsed.push({
        rowIndex: i,
        raw: row,
        organization_name,
        contact_name,
        contact_email,
        contact_phone,
        vat_number,
        building,
        service,
        sector,
        deal_type,
        deal_stage,
        owner_name,
        associated_company,
        department,
        deal_id,
        contact_id,
        company_id,
        resolved_owner_id,
        resolved_stage,
        resolved_building_id,
        resolved_incubation_type_id,
        isValid: validationErrors.length === 0,
        validationErrors,
        isDuplicate,
        duplicateOf,
        matchReason,
      });
    }

    return parsed;
  }, [consultorLookup, resolveBuilding, resolveIncubationType, t]);

  // ====================
  // FILE PARSING
  // ====================

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      let rows: Record<string, unknown>[] = [];

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        rows = await parseExcelToJson(arrayBuffer);
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        notify.error(t('dataImport.unsupportedFormat', 'Unsupported file format. Please use XLSX or CSV.'));
        return;
      }

      if (rows.length === 0) {
        notify.error(t('dataImport.emptyFile', 'The file is empty or could not be parsed.'));
        return;
      }

      const cols = Object.keys(rows[0]);
      setFileName(file.name);
      setRawRows(rows);
      setColumns(cols);

      const parsed = parseAndValidateRows(rows);
      setParsedRows(parsed);

      notify.success(t('dataImport.fileParsed', 'File parsed successfully: {{count}} rows', { count: rows.length }));
      setStep(2);
    } catch (error) {
      logger.error('Error parsing file', {}, error);
      notify.error(t('dataImport.parseError', 'Error parsing file. Please check the format.'));
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  }, [t, parseAndValidateRows]);

  // ====================
  // DRY RUN
  // ====================

  const handleDryRun = useCallback(async () => {
    if (!config.program_id) {
      notify.error(t('dataImport.selectProgram', 'Please select a program'));
      return;
    }

    setIsProcessing(true);
    try {
      const validRows = parsedRows.filter(r => r.isValid && !r.isDuplicate);
      
      // Get existing funnel items for dedup against database
      const emails = validRows.filter(r => r.contact_email).map(r => normalizeEmail(r.contact_email));
      const vats = validRows.filter(r => r.vat_number).map(r => normalizeVat(r.vat_number));

      const { data: existingByEmail } = emails.length > 0 
        ? await supabase
            .from('funnel_items')
            .select('id, contact_email, organization_name')
            .in('contact_email', emails)
        : { data: [] };

      // Build lookup maps
      const existingEmailMap = new Map<string, string>();
      (existingByEmail || []).forEach(item => {
        if (item.contact_email) {
          existingEmailMap.set(normalizeEmail(item.contact_email), item.id);
        }
      });

      // Calculate what would happen
      const details: DryRunResult['details'] = [];
      let would_insert = 0;
      let would_update = 0;

      for (const row of validRows) {
        const normalizedEmail = normalizeEmail(row.contact_email);
        const existingId = existingEmailMap.get(normalizedEmail);

        if (existingId && config.upsert_mode) {
          would_update++;
          details.push({
            rowIndex: row.rowIndex,
            name: row.organization_name || row.contact_email,
            action: 'update',
            reason: t('dataImport.emailExists', 'Email already exists in CRM'),
          });
        } else if (existingId && !config.upsert_mode) {
          details.push({
            rowIndex: row.rowIndex,
            name: row.organization_name || row.contact_email,
            action: 'skip_duplicate',
            reason: t('dataImport.skipExisting', 'Skipped (exists, upsert disabled)'),
          });
        } else {
          would_insert++;
          details.push({
            rowIndex: row.rowIndex,
            name: row.organization_name || row.contact_email,
            action: 'insert',
          });
        }
      }

      // Add invalid rows to details
      for (const row of parsedRows.filter(r => !r.isValid)) {
        details.push({
          rowIndex: row.rowIndex,
          name: row.organization_name || row.contact_email || `Row ${row.rowIndex + 1}`,
          action: 'skip_invalid',
          reason: row.validationErrors.join(', '),
        });
      }

      // Add file duplicates to details
      for (const row of parsedRows.filter(r => r.isDuplicate)) {
        details.push({
          rowIndex: row.rowIndex,
          name: row.organization_name || row.contact_email || `Row ${row.rowIndex + 1}`,
          action: 'skip_duplicate',
          reason: `${t('dataImport.duplicateOf', 'Duplicate of')} ${row.duplicateOf} (${row.matchReason})`,
        });
      }

      // Sort by row index
      details.sort((a, b) => a.rowIndex - b.rowIndex);

      setDryRunResult({
        would_insert,
        would_update,
        skipped_invalid: parsedRows.filter(r => !r.isValid).length,
        skipped_duplicate: parsedRows.filter(r => r.isDuplicate).length + 
          (config.upsert_mode ? 0 : validRows.filter(r => existingEmailMap.has(normalizeEmail(r.contact_email))).length),
        details: details.slice(0, 100), // Limit preview
      });

      notify.success(t('dataImport.dryRunComplete', 'Dry run complete'));
      setStep(3);
    } catch (error) {
      logger.error('Dry run error', {}, error);
      notify.error(t('dataImport.dryRunError', 'Error during dry run'));
    } finally {
      setIsProcessing(false);
    }
  }, [parsedRows, config, t]);

  // ====================
  // IMPORT
  // ====================

  const handleImport = useCallback(async () => {
    if (!config.program_id) {
      notify.error(t('dataImport.selectProgram', 'Please select a program'));
      return;
    }

    if (!Object.values(safetyChecks).every(Boolean)) {
      notify.error(t('dataImport.confirmSafetyChecks', 'Please confirm all safety checks'));
      return;
    }

    setIsProcessing(true);
    const errors: ImportResult['errors'] = [];
    let inserted = 0;
    let updated = 0;

    try {
      const validRows = parsedRows.filter(r => r.isValid && !r.isDuplicate);

      // Get existing for upsert matching
      const emails = validRows.filter(r => r.contact_email).map(r => normalizeEmail(r.contact_email));
      const { data: existingByEmail } = emails.length > 0
        ? await supabase
            .from('funnel_items')
            .select('id, contact_email')
            .in('contact_email', emails)
        : { data: [] };

      const existingEmailMap = new Map<string, string>();
      (existingByEmail || []).forEach(item => {
        if (item.contact_email) {
          existingEmailMap.set(normalizeEmail(item.contact_email), item.id);
        }
      });

      // Process each row
      for (const row of validRows) {
        try {
          const normalizedEmail = normalizeEmail(row.contact_email);
          const existingId = existingEmailMap.get(normalizedEmail);

          // Build notes with metadata
          const noteParts: string[] = [];
          if (row.vat_number) noteParts.push(`NIF: ${row.vat_number}`);
          if (row.building) noteParts.push(`Edifício: ${row.building}`);
          if (row.service) noteParts.push(`Serviço: ${row.service}`);
          if (row.sector) noteParts.push(`Setor: ${row.sector}`);
          if (row.deal_type) noteParts.push(`Tipo: ${row.deal_type}`);
          if (row.deal_stage) noteParts.push(`Etapa HubSpot: ${row.deal_stage}`);
          if (row.owner_name) noteParts.push(`Owner HubSpot: ${row.owner_name}`);
          if (row.associated_company) noteParts.push(`Empresa: ${row.associated_company}`);
          if (row.department) noteParts.push(`Departamento: ${row.department}`);
          if (row.deal_id) noteParts.push(`HubSpot Deal ID: ${row.deal_id}`);
          if (row.contact_id) noteParts.push(`HubSpot Contact ID: ${row.contact_id}`);
          if (row.company_id) noteParts.push(`HubSpot Company ID: ${row.company_id}`);
          noteParts.push(`Imported: ${new Date().toISOString().split('T')[0]}`);

          // Determine owner: use file owner if enabled and resolved, else fallback to config
          const finalOwnerId = (config.use_file_owner && row.resolved_owner_id) 
            ? row.resolved_owner_id 
            : (config.owner_consultant_id || null);
          
          // Determine stage: use file stage if enabled and resolved, else fallback to config
          const finalStage = (config.use_file_stage && row.resolved_stage) 
            ? row.resolved_stage 
            : config.default_stage;

          // Build tags from sector
          const tags: string[] = ['hubspot_import'];
          if (row.sector) {
            // Split sector by ; and add each as tag
            row.sector.split(';').forEach(s => {
              const tag = s.trim().toLowerCase().replace(/\s+/g, '_');
              if (tag && !tags.includes(tag)) tags.push(tag);
            });
          }
          if (row.deal_type) {
            const typeTag = row.deal_type.toLowerCase().replace(/\s+/g, '_');
            if (!tags.includes(typeTag)) tags.push(typeTag);
          }

          const funnelData = {
            organization_name: row.organization_name || null,
            contact_name: row.contact_name || null,
            contact_email: row.contact_email || null,
            contact_phone: row.contact_phone || null,
            source: 'hubspot_import',
            stage: finalStage,
            program_id: config.program_id,
            owner_consultant_id: finalOwnerId,
            tags,
            notes: noteParts.join('\n'),
            type: 'lead' as const,
          };

          if (existingId && config.upsert_mode) {
            // Update - but don't overwrite sensitive fields or empty values
            const updateData: Record<string, unknown> = {};
            
            // Only update non-empty values
            if (row.organization_name) updateData.organization_name = row.organization_name;
            if (row.contact_name) updateData.contact_name = row.contact_name;
            if (row.contact_phone) updateData.contact_phone = row.contact_phone;
            
            // Always append to notes, don't overwrite
            const { data: existing } = await supabase
              .from('funnel_items')
              .select('notes, tags')
              .eq('id', existingId)
              .single();

            const existingNotes = existing?.notes || '';
            const newNotes = existingNotes 
              ? `${existingNotes}\n\n--- Update ${new Date().toISOString().split('T')[0]} ---\n${noteParts.join('\n')}`
              : noteParts.join('\n');
            updateData.notes = newNotes;

            // Merge tags
            const existingTags = (existing?.tags || []) as string[];
            updateData.tags = [...new Set([...existingTags, 'hubspot_import'])];

            // Update stage only if allowed
            if (config.allow_stage_update) {
              updateData.stage = config.default_stage;
            }

            // Set owner only if not already set
            if (config.owner_consultant_id) {
              // We'd need to check if owner is null, but for simplicity just skip overwriting
            }

            const { error } = await supabase
              .from('funnel_items')
              .update(updateData)
              .eq('id', existingId);

            if (error) throw error;
            updated++;
          } else if (!existingId) {
            // Insert new funnel item
            const { data: insertedItem, error } = await supabase
              .from('funnel_items')
              .insert(funnelData)
              .select('id')
              .single();

            if (error) throw error;
            inserted++;

            // Create draft contract if enabled and stage is contracted with building/service
            if (config.create_draft_contracts && 
                finalStage === 'contracted' && 
                row.organization_name &&
                (row.resolved_building_id || row.resolved_incubation_type_id)) {
              
              let workspaceId: string | null = null;
              
              // First check if a startup with this name or NIF already exists
              let startupId: string | null = null;
              
              if (row.vat_number) {
                const { data: existingByNif } = await supabase
                  .from('startups')
                  .select('id')
                  .eq('nif', row.vat_number)
                  .maybeSingle();
                if (existingByNif) startupId = existingByNif.id;
              }
              
              if (!startupId) {
                const { data: existingByName } = await supabase
                  .from('startups')
                  .select('id')
                  .eq('name', row.organization_name)
                  .maybeSingle();
                if (existingByName) startupId = existingByName.id;
              }
              
              // Create startup if not found
              if (!startupId) {
                const { data: newStartup } = await supabase
                  .from('startups')
                  .insert({
                    name: row.organization_name,
                    nif: row.vat_number || null,
                    main_contact_email: row.contact_email || null,
                    main_contact_name: row.contact_name || null,
                    main_contact_phone: row.contact_phone || null,
                  })
                  .select('id')
                  .single();
                if (newStartup) startupId = newStartup.id;
              }
              
              // Now find or create workspace for this startup + program
              if (startupId) {
                const { data: existingWs } = await supabase
                  .from('workspaces')
                  .select('id')
                  .eq('startup_id', startupId)
                  .eq('program_id', config.program_id)
                  .maybeSingle();
                
                if (existingWs) {
                  workspaceId = existingWs.id;
                } else {
                  const { data: newWs } = await supabase
                    .from('workspaces')
                    .insert({
                      startup_id: startupId,
                      program_id: config.program_id,
                      assigned_consultor_id: finalOwnerId || null,
                    })
                    .select('id')
                    .single();
                  if (newWs) workspaceId = newWs.id;
                }
              }

              // Link funnel item to workspace
              if (workspaceId) {
                await supabase
                  .from('funnel_items')
                  .update({ linked_workspace_id: workspaceId })
                  .eq('id', insertedItem.id);
              }

              // Now create the draft contract
              if (workspaceId) {
                const incubationType = incubationTypes.find(it => it.id === row.resolved_incubation_type_id);
                
                await supabase
                  .from('startup_contracts')
                  .insert({
                    workspace_id: workspaceId,
                    building_id: row.resolved_building_id || null,
                    incubation_type_id: row.resolved_incubation_type_id || null,
                    funnel_item_id: insertedItem.id,
                    status: 'draft',
                    start_date: new Date().toISOString().split('T')[0],
                    monthly_fee: incubationType?.base_monthly_fee || 0,
                    notes: `Imported from HubSpot: ${row.building || ''} / ${row.service || ''}`,
                  });
              }
            }
          }
        } catch (e: any) {
          errors.push({
            rowIndex: row.rowIndex,
            name: row.organization_name || row.contact_email || `Row ${row.rowIndex + 1}`,
            error: e.message || 'Unknown error',
          });
        }
      }

      setImportResult({ inserted, updated, errors });
      notify.success(t('dataImport.importComplete', 'Import complete: {{inserted}} inserted, {{updated}} updated', { inserted, updated }));
      setStep(4);
    } catch (error) {
      logger.error('Import error', {}, error);
      notify.error(t('dataImport.importError', 'Error during import'));
    } finally {
      setIsProcessing(false);
    }
  }, [parsedRows, config, safetyChecks, incubationTypes, t]);

  // ====================
  // COMPUTED VALUES
  // ====================

  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter(r => r.isValid).length;
    const invalid = parsedRows.filter(r => !r.isValid).length;
    const duplicates = parsedRows.filter(r => r.isDuplicate).length;
    const withEmail = parsedRows.filter(r => r.contact_email).length;
    const withVat = parsedRows.filter(r => r.vat_number).length;
    const withOwner = parsedRows.filter(r => r.resolved_owner_id).length;
    const withStage = parsedRows.filter(r => r.resolved_stage).length;
    const withBuilding = parsedRows.filter(r => r.resolved_building_id).length;
    const withService = parsedRows.filter(r => r.resolved_incubation_type_id).length;
    return { total, valid, invalid, duplicates, withEmail, withVat, withOwner, withStage, withBuilding, withService };
  }, [parsedRows]);

  const filteredRows = useMemo(() => {
    if (!searchTerm) return parsedRows.slice(0, 25);
    const term = searchTerm.toLowerCase();
    return parsedRows.filter(r => 
      r.organization_name.toLowerCase().includes(term) ||
      r.contact_email.toLowerCase().includes(term) ||
      r.vat_number.toLowerCase().includes(term) ||
      r.contact_name.toLowerCase().includes(term)
    ).slice(0, 25);
  }, [parsedRows, searchTerm]);

  const allSafetyChecked = Object.values(safetyChecks).every(Boolean);

  // Access check
  if (!isAdmin && !isConsultor) {
    return (
      <AppLayout title={t('common.accessDenied', 'Access Denied')}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('common.accessDenied', 'Access Denied')}</AlertTitle>
          <AlertDescription>
            {t('dataImport.adminOnly', 'Only administrators and consultants can access this page.')}
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  // ====================
  // RENDER
  // ====================

  return (
    <AppLayout 
      title={t('dataImport.title', 'HubSpot Data Import')} 
      subtitle={t('dataImport.subtitle', 'Import organizations from HubSpot export files')}
    >
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step >= s 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              )}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className={cn(
                'text-sm hidden sm:inline',
                step >= s ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {s === 1 && t('dataImport.step1', 'Upload')}
                {s === 2 && t('dataImport.step2', 'Preview')}
                {s === 3 && t('dataImport.step3', 'Configure')}
                {s === 4 && t('dataImport.step4', 'Results')}
              </span>
              {s < 4 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t('dataImport.uploadFile', 'Upload File')}
              </CardTitle>
              <CardDescription>
                {t('dataImport.uploadDesc', 'Upload your HubSpot export file (XLSX or CSV format)')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{t('dataImport.expectedFormat', 'Expected Format')}</AlertTitle>
                <AlertDescription>
                  <p className="mb-2">{t('dataImport.expectedFormatDesc', 'The file should contain columns like:')}</p>
                  <div className="flex flex-wrap gap-2">
                    {['Nome/Company', 'Email', 'NIF', 'Telefone', 'Edifício', 'Serviço'].map(col => (
                      <Badge key={col} variant="secondary">{col}</Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>

              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="max-w-xs mx-auto cursor-pointer"
                  disabled={isProcessing}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  {t('dataImport.supportedFormats', 'XLSX, XLS, or CSV files')}
                </p>
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {t('dataImport.parsing', 'Parsing file...')}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP 2: PREVIEW */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard icon={FileSpreadsheet} label={t('dataImport.totalRows', 'Total Rows')} value={stats.total} />
              <StatCard icon={CheckCircle2} label={t('dataImport.validRows', 'Valid Rows')} value={stats.valid} color="green" />
              <StatCard icon={AlertTriangle} label={t('dataImport.invalidRows', 'Invalid Rows')} value={stats.invalid} color="red" />
              <StatCard icon={Building2} label={t('dataImport.duplicates', 'Duplicates')} value={stats.duplicates} color="yellow" />
            </div>

            {/* File Info */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{fileName}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      <Mail className="h-3 w-3 mr-1" />
                      {stats.withEmail} {t('dataImport.withEmail', 'with email')}
                    </Badge>
                    <Badge variant="outline">
                      <Hash className="h-3 w-3 mr-1" />
                      {stats.withVat} {t('dataImport.withNIF', 'with NIF')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('dataImport.searchRows', 'Search by name, email, or NIF...')}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {filteredRows.map((row) => (
                      <div 
                        key={row.rowIndex}
                        className={cn(
                          'p-3 rounded-lg border',
                          !row.isValid && 'bg-destructive/10 border-destructive/30 ',
                          row.isDuplicate && row.isValid && 'bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30 '
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">#{row.rowIndex + 1}</span>
                              <span className="font-medium truncate">
                                {row.organization_name || <span className="italic text-muted-foreground">—</span>}
                              </span>
                              {!row.isValid && (
                                <Badge variant="destructive" className="text-xs">
                                  {t('dataImport.invalid', 'Invalid')}
                                </Badge>
                              )}
                              {row.isDuplicate && (
                                <Badge variant="outline" className="text-xs bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">
                                  {t('dataImport.duplicate', 'Duplicate')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
                              {row.contact_email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {row.contact_email}
                                </span>
                              )}
                              {row.vat_number && (
                                <span className="flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  {row.vat_number}
                                </span>
                              )}
                              {row.contact_phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {row.contact_phone}
                                </span>
                              )}
                            </div>
                            {(row.building || row.owner_name || row.deal_stage) && (
                              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                                {row.building && (
                                  <span>
                                    <Building2 className="h-3 w-3 inline mr-1" />
                                    {row.building}
                                    {row.service && ` · ${row.service}`}
                                  </span>
                                )}
                                {row.owner_name && (
                                  <span className={row.resolved_owner_id ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}>
                                    👤 {row.owner_name}
                                    {row.resolved_owner_id ? ' ✓' : ' (não mapeado)'}
                                  </span>
                                )}
                                {row.deal_stage && (
                                  <span className={row.resolved_stage ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--warning))]'}>
                                    📊 {row.deal_stage}
                                    {row.resolved_stage ? ` → ${row.resolved_stage}` : ' (não mapeado)'}
                                  </span>
                                )}
                              </div>
                            )}
                            {!row.isValid && row.validationErrors.length > 0 && (
                              <div className="text-xs text-destructive mt-1">
                                {row.validationErrors.join(', ')}
                              </div>
                            )}
                            {row.isDuplicate && row.matchReason && (
                              <div className="text-xs text-[hsl(var(--warning))] mt-1">
                                {t('dataImport.duplicateOf', 'Duplicate of')} {row.duplicateOf} ({row.matchReason})
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredRows.length < parsedRows.length && (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        {t('dataImport.showingFirst', 'Showing first {{count}} of {{total}} rows', { 
                          count: filteredRows.length, 
                          total: parsedRows.length 
                        })}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Import Config */}
            <Card>
              <CardHeader>
                <CardTitle>{t('dataImport.importConfig', 'Import Configuration')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('dataImport.program', 'Program')} *</Label>
                    <Select 
                      value={config.program_id} 
                      onValueChange={v => setConfig({...config, program_id: v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('dataImport.selectProgram', 'Select program')} />
                      </SelectTrigger>
                      <SelectContent>
                        {programs?.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('dataImport.defaultStage', 'Default Stage')} *</Label>
                    <Select 
                      value={config.default_stage} 
                      onValueChange={v => setConfig({...config, default_stage: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{t('crm.stages.new', 'New')}</SelectItem>
                        <SelectItem value="first_contact_booked">{t('crm.stages.firstContactBooked', 'First Contact Booked')}</SelectItem>
                        <SelectItem value="met">{t('crm.stages.met', 'Met')}</SelectItem>
                        <SelectItem value="qualified">{t('crm.stages.qualified', 'Qualified')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('dataImport.assignTo', 'Assign to Consultant')}</Label>
                    <Select 
                      value={config.owner_consultant_id || 'none'} 
                      onValueChange={v => setConfig({...config, owner_consultant_id: v === 'none' ? '' : v})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('dataImport.noAssignment', 'No default assignment')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('dataImport.noAssignment', 'No default assignment')}</SelectItem>
                        {consultors?.filter(c => c.id).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div>
                      <Label className="text-primary">{t('dataImport.useFileOwner', 'Usar Owner do Ficheiro')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('dataImport.useFileOwnerDesc', 'Mapear "Proprietário do negócio" para consultor')}
                      </p>
                      <p className="text-xs text-[hsl(var(--success))] font-medium mt-1">
                        {stats.withOwner} de {stats.total} linhas com owner mapeado
                      </p>
                    </div>
                    <Switch
                      checked={config.use_file_owner}
                      onCheckedChange={v => setConfig({...config, use_file_owner: v})}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div>
                      <Label className="text-primary">{t('dataImport.useFileStage', 'Usar Etapa do Ficheiro')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('dataImport.useFileStageDesc', 'Mapear "Etapa do negócio" (Tier A/B/C) para stage')}
                      </p>
                      <p className="text-xs text-[hsl(var(--success))] font-medium mt-1">
                        {stats.withStage} de {stats.total} linhas com stage mapeado
                      </p>
                    </div>
                    <Switch
                      checked={config.use_file_stage}
                      onCheckedChange={v => setConfig({...config, use_file_stage: v})}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label>{t('dataImport.upsertMode', 'Update Existing Records')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('dataImport.upsertModeDesc', 'Update records that match by email')}
                      </p>
                    </div>
                    <Switch
                      checked={config.upsert_mode}
                      onCheckedChange={v => setConfig({...config, upsert_mode: v})}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label>{t('dataImport.allowStageUpdate', 'Allow Stage Update')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('dataImport.allowStageUpdateDesc', 'Update stage on existing records')}
                      </p>
                    </div>
                    <Switch
                      checked={config.allow_stage_update}
                      onCheckedChange={v => setConfig({...config, allow_stage_update: v})}
                    />
                  </div>
                </div>

                {/* Draft Contracts Toggle */}
                {(stats.withBuilding > 0 || stats.withService > 0) && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30">
                    <div>
                      <Label className="text-[hsl(var(--success))]">{t('dataImport.createDraftContracts', 'Criar Contratos Rascunho')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('dataImport.createDraftContractsDesc', 'Criar contratos draft para leads que virem "contracted" com edifício/serviço')}
                      </p>
                      <p className="text-xs text-[hsl(var(--success))] font-medium mt-1">
                        {stats.withBuilding} com edifício, {stats.withService} com serviço mapeado
                      </p>
                    </div>
                    <Switch
                      checked={config.create_draft_contracts}
                      onCheckedChange={v => setConfig({...config, create_draft_contracts: v})}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => { setStep(1); setParsedRows([]); setFileName(''); }}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('dataImport.startOver', 'Start Over')}
              </Button>
              <Button onClick={handleDryRun} disabled={isProcessing || !config.program_id}>
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('dataImport.running', 'Running...')}
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    {t('dataImport.dryRun', 'Run Dry Run')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: DRY RUN RESULTS + IMPORT */}
        {step === 3 && dryRunResult && (
          <div className="space-y-6">
            {/* Dry Run Results */}
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  {t('dataImport.dryRunResults', 'Dry Run Results')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="text-center p-4 bg-[hsl(var(--success))]/10 rounded-lg">
                    <div className="text-2xl font-bold text-[hsl(var(--success))]">{dryRunResult.would_insert}</div>
                    <div className="text-sm text-muted-foreground">{t('dataImport.toInsert', 'To Insert')}</div>
                  </div>
                  <div className="text-center p-4 bg-[hsl(var(--info))]/10 rounded-lg">
                    <div className="text-2xl font-bold text-[hsl(var(--info))]">{dryRunResult.would_update}</div>
                    <div className="text-sm text-muted-foreground">{t('dataImport.toUpdate', 'To Update')}</div>
                  </div>
                  <div className="text-center p-4 bg-destructive/10 rounded-lg">
                    <div className="text-2xl font-bold text-destructive">{dryRunResult.skipped_invalid}</div>
                    <div className="text-sm text-muted-foreground">{t('dataImport.skippedInvalid', 'Invalid')}</div>
                  </div>
                  <div className="text-center p-4 bg-[hsl(var(--warning))]/10 rounded-lg">
                    <div className="text-2xl font-bold text-[hsl(var(--warning))]">{dryRunResult.skipped_duplicate}</div>
                    <div className="text-sm text-muted-foreground">{t('dataImport.skippedDuplicate', 'Duplicates')}</div>
                  </div>
                </div>

                <ScrollArea className="h-[200px] border rounded-lg">
                  <div className="p-2 space-y-1">
                    {dryRunResult.details.map((detail, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                        <Badge variant={
                          detail.action === 'insert' ? 'default' :
                          detail.action === 'update' ? 'secondary' :
                          detail.action === 'skip_invalid' ? 'destructive' :
                          'outline'
                        } className="text-xs w-20 justify-center">
                          {detail.action.replace('skip_', '')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">#{detail.rowIndex + 1}</span>
                        <span className="truncate flex-1">{detail.name}</span>
                        {detail.reason && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{detail.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Safety Checks */}
            <Alert variant="destructive">
              <Shield className="h-4 w-4" />
              <AlertTitle>{t('dataImport.safetyTitle', 'Safety Checklist')}</AlertTitle>
              <AlertDescription>
                {t('dataImport.safetyDesc', 'Please confirm the following before proceeding:')}
              </AlertDescription>
            </Alert>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Switch
                    checked={safetyChecks.understood_dry_run}
                    onCheckedChange={v => setSafetyChecks({...safetyChecks, understood_dry_run: v})}
                  />
                  <div>
                    <Label className="cursor-pointer">
                      {t('dataImport.check1', 'I have reviewed the dry run results')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {dryRunResult.would_insert} {t('dataImport.willBeInserted', 'will be inserted')}, {dryRunResult.would_update} {t('dataImport.willBeUpdated', 'will be updated')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Switch
                    checked={safetyChecks.backup_exists}
                    onCheckedChange={v => setSafetyChecks({...safetyChecks, backup_exists: v})}
                  />
                  <div>
                    <Label className="cursor-pointer">
                      {t('dataImport.check2', 'I understand this action cannot be undone')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('dataImport.check2Desc', 'Records will be created or updated in the CRM')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Switch
                    checked={safetyChecks.program_confirmed}
                    onCheckedChange={v => setSafetyChecks({...safetyChecks, program_confirmed: v})}
                  />
                  <div>
                    <Label className="cursor-pointer">
                      {t('dataImport.check3', 'I confirm the configuration is correct')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('common.program', 'Program')}: {programs?.find(p => p.id === config.program_id)?.name || '—'} | {t('common.stage', 'Stage')}: {config.default_stage}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back', 'Back')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!allSafetyChecked || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('dataImport.importing', 'Importing...')}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('dataImport.startImport', 'Start Import')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: RESULTS */}
        {step === 4 && importResult && (
          <div className="space-y-6">
            <Alert className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
              <AlertTitle className="text-[hsl(var(--success))]">
                {t('dataImport.importComplete', 'Import Complete!')}
              </AlertTitle>
              <AlertDescription className="text-[hsl(var(--success))]">
                {t('dataImport.importSummary', '{{inserted}} records inserted, {{updated}} updated', {
                  inserted: importResult.inserted,
                  updated: importResult.updated,
                })}
                {importResult.errors.length > 0 && ` (${importResult.errors.length} errors)`}
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50">
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold text-[hsl(var(--success))]">{importResult.inserted}</div>
                  <div className="text-sm text-muted-foreground">{t('dataImport.recordsInserted', 'Records Inserted')}</div>
                </CardContent>
              </Card>
              <Card className="border-[hsl(var(--info))]/30 bg-[hsl(var(--info))]/50">
                <CardContent className="pt-6 text-center">
                  <div className="text-3xl font-bold text-[hsl(var(--info))]">{importResult.updated}</div>
                  <div className="text-sm text-muted-foreground">{t('dataImport.recordsUpdated', 'Records Updated')}</div>
                </CardContent>
              </Card>
              <Card className={cn(
                importResult.errors.length > 0 
                  ? 'border-destructive/30 bg-destructive/50' 
                  : 'border-border'
              )}>
                <CardContent className="pt-6 text-center">
                  <div className={cn(
                    'text-3xl font-bold',
                    importResult.errors.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {importResult.errors.length}
                  </div>
                  <div className="text-sm text-muted-foreground">{t('dataImport.errors', 'Errors')}</div>
                </CardContent>
              </Card>
            </div>

            {importResult.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-destructive">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    {t('dataImport.errorDetails', 'Error Details')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {importResult.errors.map((err, idx) => (
                        <div key={idx} className="text-sm p-2 rounded bg-destructive/10 border border-destructive/30">
                          <span className="font-medium">Row #{err.rowIndex + 1}: {err.name}</span>
                          <p className="text-destructive text-xs">{err.error}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => { 
                setStep(1); 
                setParsedRows([]); 
                setFileName(''); 
                setDryRunResult(null);
                setImportResult(null);
                setSafetyChecks({ understood_dry_run: false, backup_exists: false, program_confirmed: false });
              }}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('dataImport.importAnother', 'Import Another File')}
              </Button>
              <Button onClick={() => navigate('/crm')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                {t('dataImport.openCRM', 'Open CRM')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ====================
// HELPER COMPONENTS
// ====================

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color = 'default'
}: { 
  icon: React.ElementType; 
  label: string; 
  value: number;
  color?: 'default' | 'green' | 'red' | 'yellow';
}) {
  const colorClasses = {
    default: 'bg-muted text-muted-foreground',
    green: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    red: 'bg-destructive/10 text-destructive',
    yellow: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ====================
// CSV PARSER
// ====================

function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || '';
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
