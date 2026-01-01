/**
 * Stage 8: SimulationPlan Serialization Module
 * Serializes normalized plan into final SimulationPlan output format.
 */

import type {
  UUID,
  StructuredIntent,
  DecomposedIntent,
  OrganizationalTopologyModel,
  ExpandedAgentsAndWorkflows,
  IntegrationMap,
  ResolvedConstraints,
  NormalizedPlan,
  SimulationPlan,
  SimulationPlanMetadata,
  SimulationObjective,
  SerializedAgent,
  SimulationConstraints,
  ExecutionConfig,
  ExecutionPhase,
  SerializedWorkflow,
  SerializedIntegration,
  ExecutionGraph,
  AggregatedResourceRequirements,
  SimulationValidationStatus,
  ObjectiveType,
  ExecutionStrategy,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { generateDeterministicId, hashSHA256, serializeCanonical } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Planner version */
const PLANNER_VERSION = '1.0.0';
const SCHEMA_VERSION = '2.0.0';

/**
 * Creates plan metadata
 */
function createMetadata(
  intent: StructuredIntent,
  sessionId: UUID
): SimulationPlanMetadata {
  const planId = generateDeterministicId('plan', sessionId, intent.id);
  const traceId = generateDeterministicId('trace', sessionId);

  return {
    planId,
    createdAt: getCurrentTimestampUTC(),
    sourceIntent: intent.rawInput,
    traceId,
    plannerVersion: PLANNER_VERSION,
    generationSessionId: sessionId,
  };
}

/**
 * Converts atomic objectives to simulation objectives
 */
function createSimulationObjectives(
  decomposed: DecomposedIntent
): readonly SimulationObjective[] {
  return stableSort(decomposed.atomicObjectives, o => o.id).map((atomic, index) => {
    // Map action to objective type
    const objectiveType = mapActionToObjectiveType(atomic.action);

    // Extract target from action and modifiers
    const target = {
      metric: atomic.action,
      value: 100, // Default value - would be extracted from quantitative requirements
      unit: 'percent',
    };

    return {
      objectiveId: atomic.id,
      type: objectiveType,
      target,
      priority: index + 1,
      description: `${atomic.action} - ${atomic.targets.join(', ')}`,
    };
  });
}

/**
 * Maps action verbs to objective types
 */
function mapActionToObjectiveType(action: string): ObjectiveType {
  const actionLower = action.toLowerCase();

  if (actionLower.includes('reduce') || actionLower.includes('cut')) {
    return 'cost_reduction';
  }
  if (actionLower.includes('scale') || actionLower.includes('expand')) {
    return 'capacity_scaling';
  }
  if (actionLower.includes('improve') || actionLower.includes('optimize') || actionLower.includes('enhance')) {
    return 'performance_improvement';
  }
  if (actionLower.includes('mitigate') || actionLower.includes('protect')) {
    return 'risk_mitigation';
  }

  return 'resource_optimization';
}

/**
 * Creates serialized agents
 */
function createSerializedAgents(
  normalized: NormalizedPlan
): readonly SerializedAgent[] {
  return normalized.normalizedStructures.agents.map(agent => ({
    agentId: agent.id,
    type: agent.archetypeId,
    capabilities: agent.capabilities,
    allocation: {
      count: 1,
      distribution: 'static',
    },
    teamId: agent.teamId,
    role: agent.role,
    endpoints: agent.communicationEndpoints.map(e => ({
      protocol: e.protocol,
      direction: e.direction,
      messageTypes: e.messageTypes,
    })),
    objectives: agent.assignedObjectives,
    resources: {
      cpu: agent.resourceRequirements.cpu,
      memory: agent.resourceRequirements.memory,
      storage: agent.resourceRequirements.storage,
    },
  }));
}

/**
 * Creates simulation constraints
 */
function createSimulationConstraints(
  resolved: ResolvedConstraints
): SimulationConstraints {
  const temporal: { maxDuration?: number } = {};
  const resource: { maxAgents?: number } = {};
  const dependencies: { from: UUID; to: UUID; type: string }[] = [];

  for (const constraint of resolved.orderedConstraints.constraints) {
    switch (constraint.type) {
      case 'TEMPORAL':
        // Parse temporal constraints
        if (typeof constraint.specification === 'string') {
          const durationMatch = constraint.specification.match(/(\d+)\s*(days?|weeks?|months?)/);
          if (durationMatch) {
            const value = parseInt(durationMatch[1] ?? '0', 10);
            const unit = durationMatch[2] ?? 'days';
            temporal.maxDuration = convertToHours(value, unit);
          }
        }
        break;

      case 'RESOURCE':
        // Parse resource constraints
        if (typeof constraint.specification === 'object' && constraint.specification) {
          const spec = constraint.specification as Record<string, unknown>;
          if (typeof spec['maxAgents'] === 'number') {
            resource.maxAgents = spec['maxAgents'];
          }
        }
        break;

      case 'DEPENDENCY':
        if (constraint.targetEntity && typeof constraint.specification === 'object') {
          const spec = constraint.specification as Record<string, string>;
          dependencies.push({
            from: spec['from'] ?? constraint.targetEntity,
            to: spec['to'] ?? '',
            type: 'data_dependency',
          });
        }
        break;
    }
  }

  return {
    temporal: Object.keys(temporal).length > 0 ? temporal : undefined,
    resource: Object.keys(resource).length > 0 ? resource : undefined,
    dependency: dependencies.length > 0 ? dependencies : undefined,
  };
}

/**
 * Converts time value to hours
 */
function convertToHours(value: number, unit: string): number {
  if (unit.startsWith('day')) return value * 24;
  if (unit.startsWith('week')) return value * 24 * 7;
  if (unit.startsWith('month')) return value * 24 * 30;
  return value;
}

/**
 * Creates execution configuration
 */
function createExecutionConfig(
  normalized: NormalizedPlan,
  decomposed: DecomposedIntent,
  sessionId: UUID
): ExecutionConfig {
  // Determine execution strategy
  const strategy = determineExecutionStrategy(normalized);

  // Create phases from workflows
  const phases = createExecutionPhases(normalized, sessionId);

  return {
    strategy,
    phases,
    rollbackPolicy: 'automatic',
  };
}

/**
 * Determines execution strategy based on workflows
 */
function determineExecutionStrategy(
  normalized: NormalizedPlan
): ExecutionStrategy {
  const workflows = normalized.normalizedStructures.workflows;

  // If all workflows can run in parallel
  const parallelCount = workflows.filter(
    w => w.parallelizationStrategy !== 'NONE'
  ).length;

  if (parallelCount === workflows.length) {
    return 'parallel';
  }
  if (parallelCount > 0) {
    return 'hybrid';
  }
  return 'sequential';
}

/**
 * Creates execution phases from workflows
 */
function createExecutionPhases(
  normalized: NormalizedPlan,
  sessionId: UUID
): readonly ExecutionPhase[] {
  return normalized.normalizedStructures.workflows.map((workflow, index) => {
    const phaseId = generateDeterministicId('phase', sessionId, workflow.id);

    // Collect unique agents from steps
    const agentIds = new Set<UUID>();
    for (const step of workflow.steps) {
      agentIds.add(step.assignedAgentId);
    }

    return {
      phaseId,
      name: workflow.name,
      order: index + 1,
      objectives: workflow.objectives,
      agents: Array.from(agentIds).sort(),
    };
  });
}

/**
 * Creates serialized workflows
 */
function createSerializedWorkflows(
  normalized: NormalizedPlan
): readonly SerializedWorkflow[] {
  return normalized.normalizedStructures.workflows.map(workflow => ({
    id: workflow.id,
    name: workflow.name,
    objectives: workflow.objectives,
    parallelization: workflow.parallelizationStrategy,
    steps: workflow.steps.map(step => ({
      id: step.id,
      order: step.order,
      objective: step.objectiveId,
      agent: step.assignedAgentId,
      inputs: step.inputs.map(i => ({
        sourceStepId: i.sourceStepId,
        dataType: i.dataType,
      })),
      outputs: step.outputs.map(o => ({
        name: o.name,
        dataType: o.dataType,
      })),
      preconditions: step.preconditions.map(c => ({
        type: c.type,
        specification: c.specification,
      })),
      postconditions: step.postconditions.map(c => ({
        type: c.type,
        specification: c.specification,
      })),
    })),
  }));
}

/**
 * Creates serialized integrations
 */
function createSerializedIntegrations(
  integrationMap: IntegrationMap
): readonly SerializedIntegration[] {
  return integrationMap.integrationContracts.map(contract => ({
    id: contract.id,
    capability: contract.capability,
    provider: contract.provider,
    version: contract.contractVersion,
    inputSchema: contract.inputSchema,
    outputSchema: contract.outputSchema,
  }));
}

/**
 * Creates execution graph
 */
function createExecutionGraph(
  normalized: NormalizedPlan,
  decomposed: DecomposedIntent
): ExecutionGraph {
  const nodes = normalized.normalizedStructures.workflows.flatMap(workflow =>
    workflow.steps.map(step => ({
      id: step.id,
      type: 'STEP' as const,
      workflowId: workflow.id,
      agentId: step.assignedAgentId,
      order: step.order,
    }))
  );

  const edges = normalized.normalizedStructures.dependencies.map(dep => ({
    from: dep.fromStepId,
    to: dep.toStepId,
    type: 'DATA_DEPENDENCY' as const,
    dataType: dep.dataFlow,
  }));

  return { nodes, edges };
}

/**
 * Aggregates resource requirements
 */
function aggregateResourceRequirements(
  normalized: NormalizedPlan
): AggregatedResourceRequirements {
  let totalCpu = 0;
  let totalMemory = 0;
  let totalStorage = 0;

  for (const agent of normalized.normalizedStructures.agents) {
    totalCpu += agent.resourceRequirements.cpu ?? 0;
    totalMemory += agent.resourceRequirements.memory ?? 0;
    totalStorage += agent.resourceRequirements.storage ?? 0;
  }

  return {
    totalCpu: Math.round(totalCpu * 100) / 100,
    totalMemory,
    totalStorage,
    peakAgents: normalized.normalizedStructures.agents.length,
  };
}

/**
 * Creates validation status
 */
function createValidationStatus(
  normalized: NormalizedPlan,
  resolved: ResolvedConstraints,
  integrationMap: IntegrationMap
): SimulationValidationStatus {
  const allIntegrationsResolved = integrationMap.capabilityMatches.every(
    m => m.status !== 'UNMATCHED'
  );

  return {
    schemaValid: normalized.schemaValidation.valid,
    semanticallyConsistent: normalized.semanticValidation.consistent,
    constraintsSatisfied: resolved.resolutionStatus === 'RESOLVED',
    integrationsResolved: allIntegrationsResolved,
    validatedAt: getCurrentTimestampUTC(),
  };
}

/**
 * Serializes the complete SimulationPlan
 */
export async function serializeSimulationPlan(
  intent: StructuredIntent,
  decomposed: DecomposedIntent,
  topology: OrganizationalTopologyModel,
  expanded: ExpandedAgentsAndWorkflows,
  integrationMap: IntegrationMap,
  resolved: ResolvedConstraints,
  normalized: NormalizedPlan,
  sessionId: UUID,
  adapter: RuvvectorAdapter
): Promise<SimulationPlan> {
  const startTime = getCurrentTimestampUTC();

  // Create metadata
  const metadata = createMetadata(intent, sessionId);

  // Create objectives
  const objectives = createSimulationObjectives(decomposed);

  // Create agents
  const agents = createSerializedAgents(normalized);

  // Create constraints
  const constraints = createSimulationConstraints(resolved);

  // Create execution config
  const execution = createExecutionConfig(normalized, decomposed, sessionId);

  // Create workflows
  const workflows = createSerializedWorkflows(normalized);

  // Create integrations
  const integrations = createSerializedIntegrations(integrationMap);

  // Create execution graph
  const executionGraph = createExecutionGraph(normalized, decomposed);

  // Aggregate resources
  const resourceRequirements = aggregateResourceRequirements(normalized);

  // Create validation status
  const validationStatus = createValidationStatus(normalized, resolved, integrationMap);

  // Get audit trail
  const auditTrail = await adapter.getAuditTrail(sessionId);

  // Create the plan (without content hash for now)
  const planWithoutHash: Omit<SimulationPlan, 'metadata'> & { metadata: Omit<SimulationPlanMetadata, 'contentHash'> & { contentHash?: string } } = {
    version: SCHEMA_VERSION,
    metadata,
    objectives,
    agents,
    constraints,
    execution,
    workflows,
    integrations,
    executionGraph,
    resourceRequirements,
    validationStatus,
    auditTrail,
  };

  // Compute content hash from deterministic parts only (excluding timestamps and audit trail)
  const deterministicContent = {
    version: SCHEMA_VERSION,
    planId: metadata.planId,
    sourceIntent: metadata.sourceIntent,
    traceId: metadata.traceId,
    objectives,
    agents,
    constraints,
    execution,
    workflows,
    integrations,
    executionGraph,
    resourceRequirements,
  };
  const contentHash = hashSHA256(serializeCanonical(deterministicContent));

  // Create final plan with content hash
  const simulationPlan: SimulationPlan = {
    ...planWithoutHash,
    metadata: {
      ...metadata,
      contentHash,
    },
  };

  // Store in ruvvector
  await adapter.store(
    `plan:${metadata.planId}`,
    simulationPlan,
    { stage: 'SERIALIZATION', type: 'simulation_plan' }
  );

  // Create relation to normalized plan
  await adapter.createRelation(
    metadata.planId,
    normalized.id,
    'SERIALIZED_FROM',
    { stage: 'SERIALIZATION' }
  );

  // Append final audit entry
  const auditEntry: AuditEntry = {
    stage: 'SERIALIZATION',
    operation: 'SERIALIZE',
    inputId: normalized.id,
    outputId: metadata.planId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'SUCCESS',
    contentHash,
    metrics: {
      objectiveCount: objectives.length,
      agentCount: agents.length,
      workflowCount: workflows.length,
      phaseCount: execution.phases.length,
      integrationCount: integrations.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return simulationPlan;
}
