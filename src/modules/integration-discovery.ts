/**
 * Stage 5: Integration Discovery Module
 * Discovers and matches capabilities with agentics repository surfaces.
 * Includes ERP surface discovery for simulation planning.
 */

import type {
  UUID,
  ExpandedAgentsAndWorkflows,
  IntegrationMap,
  RepositoryCapabilitySurface,
  Capability,
  CapabilityMatch,
  CapabilityProvider,
  IntegrationContract,
  Endpoint,
  Contract,
  SLASpecification,
  MatchStatus,
  RepositoryStatus,
  RuvvectorAdapter,
  AuditEntry,
  ERPSurfaceContract,
  ERPCapability,
  ERPDomain,
  ERPIntegrationRequirement,
  ERPCapabilityType,
} from '../types/index.js';
import { ERP_DOMAIN_CAPABILITIES, getCapabilityDomain } from '../types/index.js';
import { IntegrationError } from '../types/errors.js';
import { generateDeterministicId } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Simulated repository capability surfaces */
const REPOSITORY_SURFACES: readonly RepositoryCapabilitySurface[] = [
  {
    repository: 'agentics-simulation-runner',
    version: '3.0.0',
    status: 'AVAILABLE',
    capabilities: [
      { id: 'run-001', name: 'simulation_execution', version: '3.0.0' },
      { id: 'run-002', name: 'agent_lifecycle', version: '3.0.0' },
      { id: 'run-003', name: 'state_management', version: '3.0.0' },
      { id: 'run-004', name: 'metrics_collection', version: '3.0.0' },
    ],
    endpoints: [
      { path: '/api/v3/simulations', method: 'POST', version: '3.0.0' },
      { path: '/api/v3/simulations/{id}/status', method: 'GET', version: '3.0.0' },
    ],
    contracts: [
      {
        version: '3.0.0',
        inputSchema: { type: 'SimulationPlan' },
        outputSchema: { type: 'SimulationResult' },
        sla: { availability: 99.9, latencyP50Ms: 100, latencyP99Ms: 500, throughputPerSecond: 1000 },
      },
    ],
  },
  {
    repository: 'agentics-deployment-intent',
    version: '2.0.0',
    status: 'AVAILABLE',
    capabilities: [
      { id: 'dep-001', name: 'deployment_promotion', version: '2.0.0' },
      { id: 'dep-002', name: 'deployment_validation', version: '2.0.0' },
      { id: 'dep-003', name: 'rollback_support', version: '2.0.0' },
    ],
    endpoints: [
      { path: '/api/v2/deployments', method: 'POST', version: '2.0.0' },
      { path: '/api/v2/deployments/{id}/promote', method: 'POST', version: '2.0.0' },
    ],
    contracts: [
      {
        version: '2.0.0',
        inputSchema: { type: 'SimulationPlan' },
        outputSchema: { type: 'DeploymentIntent' },
        sla: { availability: 99.95, latencyP50Ms: 200, latencyP99Ms: 1000, throughputPerSecond: 100 },
      },
    ],
  },
  {
    repository: 'agentics-core-types',
    version: '1.5.0',
    status: 'AVAILABLE',
    capabilities: [
      { id: 'core-001', name: 'type_definitions', version: '1.5.0' },
      { id: 'core-002', name: 'schema_validation', version: '1.5.0' },
    ],
  },
  {
    repository: 'agentics-observability',
    version: '2.0.0',
    status: 'AVAILABLE',
    capabilities: [
      { id: 'obs-001', name: 'telemetry', version: '2.0.0' },
      { id: 'obs-002', name: 'logging', version: '2.0.0' },
      { id: 'obs-003', name: 'tracing', version: '2.0.0' },
    ],
    endpoints: [
      { path: '/api/v2/metrics', method: 'POST', version: '2.0.0' },
      { path: '/api/v2/traces', method: 'POST', version: '2.0.0' },
    ],
  },
];

/**
 * Capability matching keywords map
 */
const CAPABILITY_KEYWORDS: Record<string, readonly string[]> = {
  'data_analysis': ['analysis', 'data', 'reporting'],
  'reporting': ['report', 'visualization', 'metrics'],
  'coordination': ['coordinate', 'schedule', 'orchestrate'],
  'task_execution': ['execute', 'run', 'process'],
  'process_automation': ['automate', 'workflow', 'automation'],
  'validation': ['validate', 'verify', 'check'],
  'optimization': ['optimize', 'improve', 'tune'],
  'integration': ['integrate', 'connect', 'api'],
};

/**
 * ERP capability matching keywords
 * Maps agent capability strings to ERP domains and capabilities
 */
const ERP_CAPABILITY_KEYWORDS: Record<string, { domain: ERPDomain; capabilities: readonly ERPCapabilityType[] }> = {
  // Finance-related keywords
  'finance': { domain: 'FINANCE', capabilities: ['general_ledger', 'financial_reporting'] },
  'accounting': { domain: 'FINANCE', capabilities: ['general_ledger', 'accounts_payable', 'accounts_receivable'] },
  'budget': { domain: 'FINANCE', capabilities: ['budgeting', 'cost_accounting'] },
  'expense': { domain: 'FINANCE', capabilities: ['expense_management'] },
  'revenue': { domain: 'FINANCE', capabilities: ['revenue_recognition'] },
  'tax': { domain: 'FINANCE', capabilities: ['tax_management'] },
  'treasury': { domain: 'FINANCE', capabilities: ['treasury_management'] },

  // HR-related keywords
  'hr': { domain: 'HUMAN_RESOURCES', capabilities: ['employee_management'] },
  'human_resources': { domain: 'HUMAN_RESOURCES', capabilities: ['employee_management'] },
  'employee': { domain: 'HUMAN_RESOURCES', capabilities: ['employee_management'] },
  'payroll': { domain: 'HUMAN_RESOURCES', capabilities: ['payroll_processing'] },
  'recruitment': { domain: 'HUMAN_RESOURCES', capabilities: ['recruitment'] },
  'hiring': { domain: 'HUMAN_RESOURCES', capabilities: ['recruitment'] },
  'performance': { domain: 'HUMAN_RESOURCES', capabilities: ['performance_management'] },
  'training': { domain: 'HUMAN_RESOURCES', capabilities: ['learning_management'] },
  'workforce': { domain: 'HUMAN_RESOURCES', capabilities: ['workforce_planning'] },
  'benefits': { domain: 'HUMAN_RESOURCES', capabilities: ['benefits_administration'] },

  // Operations-related keywords
  'operations': { domain: 'OPERATIONS', capabilities: ['production_planning', 'operational_analytics'] },
  'production': { domain: 'OPERATIONS', capabilities: ['production_planning', 'shop_floor_control'] },
  'quality': { domain: 'OPERATIONS', capabilities: ['quality_management'] },
  'maintenance': { domain: 'OPERATIONS', capabilities: ['maintenance_management'] },
  'manufacturing': { domain: 'OPERATIONS', capabilities: ['production_planning', 'bill_of_materials'] },
  'capacity': { domain: 'OPERATIONS', capabilities: ['capacity_planning'] },

  // Supply Chain-related keywords
  'supply_chain': { domain: 'SUPPLY_CHAIN', capabilities: ['inventory_management', 'supply_chain_analytics'] },
  'inventory': { domain: 'SUPPLY_CHAIN', capabilities: ['inventory_management'] },
  'warehouse': { domain: 'SUPPLY_CHAIN', capabilities: ['warehouse_management'] },
  'logistics': { domain: 'SUPPLY_CHAIN', capabilities: ['logistics_management'] },
  'shipping': { domain: 'SUPPLY_CHAIN', capabilities: ['shipment_tracking'] },
  'procurement': { domain: 'PROCUREMENT', capabilities: ['purchase_order_management', 'supplier_management'] },
  'supplier': { domain: 'SUPPLY_CHAIN', capabilities: ['supplier_management'] },
  'order': { domain: 'SUPPLY_CHAIN', capabilities: ['order_management'] },
  'demand': { domain: 'SUPPLY_CHAIN', capabilities: ['demand_forecasting'] },

  // Customer-related keywords
  'customer': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['customer_data_management', 'customer_analytics'] },
  'sales': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['sales_management'] },
  'crm': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['customer_data_management'] },
  'service': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['service_management'] },
  'contract': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['contract_management'] },
  'campaign': { domain: 'CUSTOMER_RELATIONSHIP', capabilities: ['campaign_management'] },

  // Project-related keywords
  'project': { domain: 'PROJECT_MANAGEMENT', capabilities: ['project_planning', 'project_reporting'] },
  'portfolio': { domain: 'PROJECT_MANAGEMENT', capabilities: ['portfolio_management'] },
  'milestone': { domain: 'PROJECT_MANAGEMENT', capabilities: ['milestone_tracking'] },
  'resource_allocation': { domain: 'PROJECT_MANAGEMENT', capabilities: ['resource_allocation'] },
};

/**
 * Synthetic ERP surface contracts for simulation planning
 * These represent abstract ERP capabilities without vendor-specific implementation
 */
const ERP_SURFACE_CONTRACTS: readonly ERPSurfaceContract[] = [
  {
    surfaceId: 'erp-surface-finance',
    name: 'ERP Finance Surface',
    domain: 'FINANCE',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.FINANCE.map((cap, idx) => ({
      id: `erp-fin-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'FINANCE' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 50, p90Ms: 150, p99Ms: 500 },
      simulatedThroughput: { transactionsPerSecond: 100, eventsPerSecond: 500, maxConcurrentOperations: 50 },
      complianceProfile: { retentionRequired: true, auditTrailRequired: true, complianceFrameworks: ['SOX', 'GAAP'] },
    },
  },
  {
    surfaceId: 'erp-surface-hr',
    name: 'ERP Human Resources Surface',
    domain: 'HUMAN_RESOURCES',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.HUMAN_RESOURCES.map((cap, idx) => ({
      id: `erp-hr-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'HUMAN_RESOURCES' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 30, p90Ms: 100, p99Ms: 300 },
      simulatedThroughput: { transactionsPerSecond: 50, eventsPerSecond: 200, maxConcurrentOperations: 25 },
      complianceProfile: { retentionRequired: true, auditTrailRequired: true, complianceFrameworks: ['GDPR', 'HIPAA'] },
    },
  },
  {
    surfaceId: 'erp-surface-operations',
    name: 'ERP Operations Surface',
    domain: 'OPERATIONS',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.OPERATIONS.map((cap, idx) => ({
      id: `erp-ops-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'OPERATIONS' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 20, p90Ms: 80, p99Ms: 200 },
      simulatedThroughput: { transactionsPerSecond: 200, eventsPerSecond: 1000, maxConcurrentOperations: 100 },
    },
  },
  {
    surfaceId: 'erp-surface-supply-chain',
    name: 'ERP Supply Chain Surface',
    domain: 'SUPPLY_CHAIN',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.SUPPLY_CHAIN.map((cap, idx) => ({
      id: `erp-sc-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'SUPPLY_CHAIN' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 40, p90Ms: 120, p99Ms: 400 },
      simulatedThroughput: { transactionsPerSecond: 150, eventsPerSecond: 600, maxConcurrentOperations: 75 },
    },
  },
  {
    surfaceId: 'erp-surface-customer',
    name: 'ERP Customer Relationship Surface',
    domain: 'CUSTOMER_RELATIONSHIP',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.CUSTOMER_RELATIONSHIP.map((cap, idx) => ({
      id: `erp-crm-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'CUSTOMER_RELATIONSHIP' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 25, p90Ms: 90, p99Ms: 250 },
      simulatedThroughput: { transactionsPerSecond: 300, eventsPerSecond: 1500, maxConcurrentOperations: 150 },
    },
  },
  {
    surfaceId: 'erp-surface-project',
    name: 'ERP Project Management Surface',
    domain: 'PROJECT_MANAGEMENT',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.PROJECT_MANAGEMENT.map((cap, idx) => ({
      id: `erp-pm-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'PROJECT_MANAGEMENT' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 35, p90Ms: 110, p99Ms: 350 },
      simulatedThroughput: { transactionsPerSecond: 80, eventsPerSecond: 400, maxConcurrentOperations: 40 },
    },
  },
  {
    surfaceId: 'erp-surface-procurement',
    name: 'ERP Procurement Surface',
    domain: 'PROCUREMENT',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.PROCUREMENT.map((cap, idx) => ({
      id: `erp-proc-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'PROCUREMENT' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 45, p90Ms: 130, p99Ms: 450 },
      simulatedThroughput: { transactionsPerSecond: 60, eventsPerSecond: 250, maxConcurrentOperations: 30 },
      complianceProfile: { retentionRequired: true, auditTrailRequired: true },
    },
  },
  {
    surfaceId: 'erp-surface-asset',
    name: 'ERP Asset Management Surface',
    domain: 'ASSET_MANAGEMENT',
    version: '1.0.0',
    status: 'AVAILABLE',
    capabilities: ERP_DOMAIN_CAPABILITIES.ASSET_MANAGEMENT.map((cap, idx) => ({
      id: `erp-asset-${String(idx + 1).padStart(3, '0')}`,
      name: cap,
      domain: 'ASSET_MANAGEMENT' as ERPDomain,
      version: '1.0.0',
    })),
    metadata: {
      simulatedLatencyMs: { p50Ms: 30, p90Ms: 100, p99Ms: 300 },
      simulatedThroughput: { transactionsPerSecond: 40, eventsPerSecond: 200, maxConcurrentOperations: 20 },
    },
  },
];

/**
 * Detects ERP capability requirements from agent capabilities
 */
function detectERPRequirements(
  expanded: ExpandedAgentsAndWorkflows,
  sessionId: UUID
): readonly ERPIntegrationRequirement[] {
  const requirements: ERPIntegrationRequirement[] = [];
  const seenDomains = new Set<ERPDomain>();

  for (const agent of expanded.agentSpecifications) {
    for (const capability of agent.capabilities) {
      const capLower = capability.toLowerCase().replace(/_/g, ' ');

      // Check each ERP keyword
      for (const [keyword, erpInfo] of Object.entries(ERP_CAPABILITY_KEYWORDS)) {
        if (capLower.includes(keyword) || keyword.includes(capLower)) {
          // Only add one requirement per domain to avoid duplicates
          if (!seenDomains.has(erpInfo.domain)) {
            seenDomains.add(erpInfo.domain);

            const reqId = generateDeterministicId(
              'erp-req',
              sessionId,
              erpInfo.domain
            );

            requirements.push({
              id: reqId,
              domain: erpInfo.domain,
              requiredCapabilities: erpInfo.capabilities.map(cap => ({
                capability: cap,
                domain: erpInfo.domain,
                priority: 'MEDIUM',
                reason: `Inferred from agent capability: ${capability}`,
              })),
              priority: 'MEDIUM',
              supportingObjectiveId: agent.assignedObjectives[0],
            });
          }
        }
      }
    }
  }

  return requirements;
}

/**
 * Gets ERP surfaces that match the requirements
 */
function getMatchingERPSurfaces(
  requirements: readonly ERPIntegrationRequirement[]
): readonly ERPSurfaceContract[] {
  const matchedSurfaces: ERPSurfaceContract[] = [];
  const seenSurfaceIds = new Set<string>();

  for (const req of requirements) {
    for (const surface of ERP_SURFACE_CONTRACTS) {
      if (surface.domain === req.domain && !seenSurfaceIds.has(surface.surfaceId)) {
        seenSurfaceIds.add(surface.surfaceId);
        matchedSurfaces.push(surface);
      }
    }
  }

  return matchedSurfaces;
}

/**
 * Collects all required capabilities from expanded agents
 */
function collectRequiredCapabilities(
  expanded: ExpandedAgentsAndWorkflows
): Set<string> {
  const required = new Set<string>();

  for (const agent of expanded.agentSpecifications) {
    for (const cap of agent.capabilities) {
      required.add(cap);
    }
  }

  return required;
}

/**
 * Finds providers for a capability
 */
function findProviders(
  capability: string,
  surfaces: readonly RepositoryCapabilitySurface[]
): readonly CapabilityProvider[] {
  const providers: CapabilityProvider[] = [];

  for (const surface of surfaces) {
    for (const cap of surface.capabilities) {
      const score = computeMatchScore(capability, cap.name);
      if (score > 0) {
        const endpoint = surface.endpoints?.[0];
        const contract = surface.contracts?.[0];

        providers.push({
          repository: surface.repository,
          capability: cap,
          endpoint,
          contract,
          matchScore: score,
        });
      }
    }
  }

  return stableSort(providers, p => -p.matchScore);
}

/**
 * Computes match score between required capability and provided capability
 */
function computeMatchScore(required: string, provided: string): number {
  const requiredLower = required.toLowerCase().replace(/_/g, ' ');
  const providedLower = provided.toLowerCase().replace(/_/g, ' ');

  // Exact match
  if (requiredLower === providedLower) {
    return 100;
  }

  // Partial match
  if (providedLower.includes(requiredLower) || requiredLower.includes(providedLower)) {
    return 75;
  }

  // Keyword match
  const keywords = CAPABILITY_KEYWORDS[required] ?? [];
  for (const keyword of keywords) {
    if (providedLower.includes(keyword)) {
      return 50;
    }
  }

  return 0;
}

/**
 * Matches capabilities to providers
 */
function matchCapabilities(
  requiredCapabilities: Set<string>,
  surfaces: readonly RepositoryCapabilitySurface[]
): readonly CapabilityMatch[] {
  const matches: CapabilityMatch[] = [];

  for (const required of requiredCapabilities) {
    const providers = findProviders(required, surfaces);

    let status: MatchStatus = 'UNMATCHED';
    let selectedProvider: CapabilityProvider | undefined;

    if (providers.length > 0) {
      const bestProvider = providers[0]!;
      if (bestProvider.matchScore >= 75) {
        status = 'MATCHED';
        selectedProvider = bestProvider;
      } else if (bestProvider.matchScore >= 50) {
        status = 'PARTIAL';
        selectedProvider = bestProvider;
      }
    }

    matches.push({
      requiredCapability: required,
      providers,
      selectedProvider,
      status,
    });
  }

  return stableSort(matches, m => m.requiredCapability);
}

/**
 * Creates integration contracts from capability matches
 */
function createIntegrationContracts(
  matches: readonly CapabilityMatch[],
  sessionId: UUID
): readonly IntegrationContract[] {
  const contracts: IntegrationContract[] = [];

  for (const match of matches) {
    if (match.status !== 'UNMATCHED' && match.selectedProvider) {
      const provider = match.selectedProvider;
      const contractId = generateDeterministicId(
        'contract',
        sessionId,
        match.requiredCapability,
        provider.repository
      );

      contracts.push({
        id: contractId,
        capability: match.requiredCapability,
        provider: provider.repository,
        contractVersion: provider.contract?.version ?? provider.capability.version,
        inputSchema: provider.contract?.inputSchema ?? {},
        outputSchema: provider.contract?.outputSchema ?? {},
        errorSchema: provider.contract?.errorSchema,
        sla: provider.contract?.sla,
      });
    }
  }

  return contracts;
}

/**
 * Discovers and matches integrations
 */
export async function discoverIntegrations(
  expanded: ExpandedAgentsAndWorkflows,
  sessionId: UUID,
  adapter: RuvvectorAdapter
): Promise<IntegrationMap> {
  const startTime = getCurrentTimestampUTC();

  // Collect required capabilities
  const requiredCapabilities = collectRequiredCapabilities(expanded);

  // Match capabilities to repository surfaces
  const capabilityMatches = matchCapabilities(requiredCapabilities, REPOSITORY_SURFACES);

  // Check for unmatched critical capabilities
  const unmatchedCritical = capabilityMatches.filter(m => m.status === 'UNMATCHED');
  if (unmatchedCritical.length > 0) {
    // Log warning but continue (non-fatal for partial matches)
    console.warn(
      `Warning: ${unmatchedCritical.length} capabilities could not be matched:`,
      unmatchedCritical.map(m => m.requiredCapability)
    );
  }

  // Create integration contracts
  const integrationContracts = createIntegrationContracts(capabilityMatches, sessionId);

  // Detect ERP integration requirements from agent capabilities
  const erpRequirements = detectERPRequirements(expanded, sessionId);

  // Get matching ERP surfaces for the detected requirements
  const erpSurfaces = getMatchingERPSurfaces(erpRequirements);

  // Generate deterministic ID
  const integrationMapId = generateDeterministicId(
    'integration',
    sessionId,
    expanded.id
  );

  // Create integration map with ERP surface references
  const integrationMap: IntegrationMap = {
    id: integrationMapId,
    expandedId: expanded.id,
    repositorySurfaces: REPOSITORY_SURFACES,
    capabilityMatches,
    integrationContracts,
    timestamp: startTime,
    // ERP surface integration (abstract, contract-level only)
    erpSurfaces: erpSurfaces.length > 0 ? erpSurfaces : undefined,
    erpRequirements: erpRequirements.length > 0 ? erpRequirements : undefined,
  };

  // Store in ruvvector
  await adapter.store(
    `integration:${integrationMapId}`,
    integrationMap,
    { stage: 'INTEGRATION_DISCOVERY', type: 'integration_map' }
  );

  // Create relation to expanded
  await adapter.createRelation(
    integrationMapId,
    expanded.id,
    'DISCOVERED_FROM',
    { stage: 'INTEGRATION_DISCOVERY' }
  );

  // Append audit entry with ERP metrics
  const matchedCount = capabilityMatches.filter(m => m.status === 'MATCHED').length;
  const partialCount = capabilityMatches.filter(m => m.status === 'PARTIAL').length;
  const unmatchedCount = capabilityMatches.filter(m => m.status === 'UNMATCHED').length;

  const auditEntry: AuditEntry = {
    stage: 'INTEGRATION_DISCOVERY',
    operation: 'DISCOVER',
    inputId: expanded.id,
    outputId: integrationMapId,
    timestamp: getCurrentTimestampUTC(),
    decision: unmatchedCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
    metrics: {
      requiredCapabilityCount: requiredCapabilities.size,
      matchedCount,
      partialCount,
      unmatchedCount,
      contractCount: integrationContracts.length,
      // ERP surface metrics
      erpDomainsDetected: erpRequirements.length,
      erpSurfacesMatched: erpSurfaces.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return integrationMap;
}

/**
 * Gets all available ERP surface contracts.
 * Used for introspection and capability enumeration.
 */
export function getAvailableERPSurfaces(): readonly ERPSurfaceContract[] {
  return ERP_SURFACE_CONTRACTS;
}

/**
 * Gets an ERP surface by domain.
 */
export function getERPSurfaceByDomain(domain: ERPDomain): ERPSurfaceContract | undefined {
  return ERP_SURFACE_CONTRACTS.find(surface => surface.domain === domain);
}

/**
 * Checks if a capability string might require ERP integration.
 */
export function detectsERPCapability(capability: string): boolean {
  const capLower = capability.toLowerCase().replace(/_/g, ' ');
  return Object.keys(ERP_CAPABILITY_KEYWORDS).some(
    keyword => capLower.includes(keyword) || keyword.includes(capLower)
  );
}
