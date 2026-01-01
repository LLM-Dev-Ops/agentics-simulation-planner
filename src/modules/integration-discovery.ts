/**
 * Stage 5: Integration Discovery Module
 * Discovers and matches capabilities with agentics repository surfaces.
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
} from '../types/index.js';
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

  // Generate deterministic ID
  const integrationMapId = generateDeterministicId(
    'integration',
    sessionId,
    expanded.id
  );

  // Create integration map
  const integrationMap: IntegrationMap = {
    id: integrationMapId,
    expandedId: expanded.id,
    repositorySurfaces: REPOSITORY_SURFACES,
    capabilityMatches,
    integrationContracts,
    timestamp: startTime,
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

  // Append audit entry
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
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return integrationMap;
}
