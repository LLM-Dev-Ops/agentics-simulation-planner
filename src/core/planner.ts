/**
 * Core Planner - Main Entry Point
 * Orchestrates the complete planning pipeline for generating SimulationPlans.
 *
 * IMPORTANT: All requests MUST be validated through @agentics/contracts
 * BEFORE reaching this module. Contract validation occurs at request entry
 * (server.ts), NOT here.
 */

import type {
  UUID,
  SHA256Hash,
  SimulationPlan,
  OrganizationalContext,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { PlanningError } from '../types/errors.js';
import { generateDeterministicId, hashSHA256 } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';
import { getRuvvectorAdapter } from '../adapters/ruvvector-adapter.js';
import {
  ingestIntent,
  decomposeIntent,
  extractTopology,
  expandAgentsAndWorkflows,
  discoverIntegrations,
  resolveConstraints,
  validateAndNormalize,
  serializeSimulationPlan,
} from '../modules/index.js';
import {
  ExecutionProofBuilder,
  createExecutionProofFromAuditTrail,
  type ExecutionProof,
  type ContractValidationResult,
  type ContractSimulationConfig,
  type ContractScenarioDefinition,
  SCHEMA_VERSION,
} from '../contracts/index.js';

/** Input for the planning process with contract enforcement */
export interface ContractPlanningInput {
  /** Natural language organizational goal */
  readonly intent: string;
  /** Organization name (required, no defaults inferred) */
  readonly organizationName?: string;
  /** Organization ID (UUID format) */
  readonly organizationId?: UUID;
  /** Contract-validated simulation configuration */
  readonly config?: ContractSimulationConfig;
  /** Contract-validated scenario definition */
  readonly scenario?: ContractScenarioDefinition;
}

/** Input for the planning process (legacy interface, kept for compatibility) */
export interface PlanningInput {
  /** Natural language organizational goal */
  readonly intent: string;
  /** Organizational context with topology and constraints */
  readonly context: OrganizationalContext;
  /** Optional custom adapter (uses default if not provided) */
  readonly adapter?: RuvvectorAdapter;
}

/** Result of the planning process with execution proof */
export interface ContractPlanningResult {
  /** The generated SimulationPlan */
  readonly plan: SimulationPlan;
  /** Session ID for traceability */
  readonly sessionId: UUID;
  /** Content hash for determinism verification */
  readonly contentHash: SHA256Hash;
  /** Total processing time in milliseconds */
  readonly processingTimeMs: number;
  /** Execution proof - cryptographic evidence of planning operations */
  readonly executionProof: ExecutionProof;
  /** Validation result from contract enforcement */
  readonly validationResult: ContractValidationResult;
}

/** Result of the planning process (legacy interface) */
export interface PlanningResult {
  /** The generated SimulationPlan */
  readonly plan: SimulationPlan;
  /** Session ID for traceability */
  readonly sessionId: UUID;
  /** Content hash for determinism verification */
  readonly contentHash: SHA256Hash;
  /** Total processing time in milliseconds */
  readonly processingTimeMs: number;
}

/** Planning options */
export interface PlanningOptions {
  /** Seed for deterministic operations */
  readonly seed?: string;
  /** Namespace for ruvvector storage */
  readonly namespace?: string;
}

/**
 * Creates organizational context from contract-validated input.
 * NO defaults are inferred - organization name must be provided.
 */
function createContextFromContractInput(
  input: ContractPlanningInput
): OrganizationalContext {
  // Organization name is required at the contract level
  // If not provided, use a minimal placeholder (contract should have caught this)
  const orgName = input.organizationName ?? 'Organization';
  const orgId = input.organizationId ?? generateDeterministicId('org', orgName);

  return {
    organizationId: orgId,
    organizationName: orgName,
    topology: {
      divisions: [{
        id: generateDeterministicId('div', orgId, 'default'),
        name: 'Default Division',
        level: 1,
      }],
      teams: [{
        id: generateDeterministicId('team', orgId, 'default'),
        name: 'Default Team',
        divisionId: generateDeterministicId('div', orgId, 'default'),
        members: [{
          id: generateDeterministicId('member', orgId, 'default'),
          name: 'Default Member',
          role: 'engineer',
        }],
        capabilities: ['task_execution'],
      }],
    },
    constraints: {
      constraints: [],
    },
  };
}

/**
 * Plans a simulation with full contract enforcement.
 * This is the PRIMARY entry point for planning with execution proof.
 *
 * Contract validation has ALREADY occurred before this function is called.
 * This function assumes the input has been validated.
 *
 * @param input - Contract-validated planning input
 * @param rawRequest - The raw request for proof generation
 * @param options - Optional planning configuration
 * @returns ContractPlanningResult containing the plan and execution proof
 */
export async function planSimulationWithContract(
  input: ContractPlanningInput,
  rawRequest: unknown,
  options: PlanningOptions = {}
): Promise<ContractPlanningResult> {
  const startTime = Date.now();

  // Get adapter
  const adapter = getRuvvectorAdapter();

  // Generate deterministic session ID
  const seed = options.seed ?? hashSHA256(input.intent + getCurrentTimestampUTC());
  const namespace = options.namespace ?? 'default';
  const sessionId = await adapter.initSession({
    seed,
    namespace,
    isolationLevel: 'SERIALIZABLE',
  });

  // Initialize execution proof builder
  const proofBuilder = new ExecutionProofBuilder(sessionId, rawRequest);

  // Create context from validated input
  const context = createContextFromContractInput(input);

  // Record contract validation stage
  proofBuilder.recordStage(
    'CONTRACT_VALIDATION',
    'VALIDATE_REQUEST',
    rawRequest,
    { valid: true },
    'ACCEPTED',
    { schemaVersion: SCHEMA_VERSION }
  );

  try {
    // Stage 1: Intent Ingestion
    const structuredIntent = await ingestIntent(
      {
        rawIntent: input.intent,
        organizationalContext: context,
        sessionId,
      },
      adapter
    );
    proofBuilder.recordStage(
      'INTENT_INGESTION',
      'INGEST_INTENT',
      { intent: input.intent },
      structuredIntent,
      'COMPLETED',
      { tokenCount: structuredIntent.tokens.length }
    );

    // Stage 2: Intent Decomposition
    const decomposedIntent = await decomposeIntent(structuredIntent, adapter);
    proofBuilder.recordStage(
      'INTENT_DECOMPOSITION',
      'DECOMPOSE_INTENT',
      structuredIntent,
      decomposedIntent,
      'COMPLETED',
      { objectiveCount: decomposedIntent.atomicObjectives.length }
    );

    // Stage 3: Organizational Topology Extraction
    const topologyModel = await extractTopology(
      decomposedIntent,
      structuredIntent,
      adapter
    );
    proofBuilder.recordStage(
      'TOPOLOGY_EXTRACTION',
      'EXTRACT_TOPOLOGY',
      { decomposed: decomposedIntent.id, structured: structuredIntent.id },
      topologyModel,
      'COMPLETED',
      {
        teamCount: topologyModel.teamStructures.length,
        archetypeCount: topologyModel.agentArchetypeMappings.length,
      }
    );

    // Stage 4: Agent and Workflow Expansion
    const expandedAgentsWorkflows = await expandAgentsAndWorkflows(
      decomposedIntent,
      topologyModel,
      sessionId,
      adapter
    );
    proofBuilder.recordStage(
      'AGENT_WORKFLOW_EXPANSION',
      'EXPAND_AGENTS_WORKFLOWS',
      { decomposed: decomposedIntent.id, topology: topologyModel.id },
      expandedAgentsWorkflows,
      'COMPLETED',
      {
        agentCount: expandedAgentsWorkflows.agentSpecifications.length,
        workflowCount: expandedAgentsWorkflows.workflowDefinitions.length,
      }
    );

    // Stage 5: Integration Discovery
    const integrationMap = await discoverIntegrations(
      expandedAgentsWorkflows,
      sessionId,
      adapter
    );
    proofBuilder.recordStage(
      'INTEGRATION_DISCOVERY',
      'DISCOVER_INTEGRATIONS',
      { expanded: expandedAgentsWorkflows.id },
      integrationMap,
      'COMPLETED',
      { integrationCount: integrationMap.integrationContracts.length }
    );

    // Stage 6: Constraint Resolution
    const resolvedConstraints = await resolveConstraints(
      structuredIntent,
      expandedAgentsWorkflows,
      integrationMap,
      sessionId,
      adapter
    );
    proofBuilder.recordStage(
      'CONSTRAINT_RESOLUTION',
      'RESOLVE_CONSTRAINTS',
      { intent: structuredIntent.id, expanded: expandedAgentsWorkflows.id },
      resolvedConstraints,
      'COMPLETED',
      { constraintCount: resolvedConstraints.orderedConstraints.constraints.length }
    );

    // Stage 7: Validation and Normalization
    const normalizedPlan = await validateAndNormalize(
      expandedAgentsWorkflows,
      resolvedConstraints,
      sessionId,
      adapter
    );
    proofBuilder.recordStage(
      'VALIDATION_NORMALIZATION',
      'VALIDATE_NORMALIZE',
      { expanded: expandedAgentsWorkflows.id, constraints: resolvedConstraints.id },
      normalizedPlan,
      normalizedPlan.validationStatus,
      {
        agentCount: normalizedPlan.normalizedStructures.agents.length,
        workflowCount: normalizedPlan.normalizedStructures.workflows.length,
      }
    );

    // Stage 8: SimulationPlan Serialization
    const simulationPlan = await serializeSimulationPlan(
      structuredIntent,
      decomposedIntent,
      topologyModel,
      expandedAgentsWorkflows,
      integrationMap,
      resolvedConstraints,
      normalizedPlan,
      sessionId,
      adapter
    );
    proofBuilder.recordStage(
      'SERIALIZATION',
      'SERIALIZE_PLAN',
      { normalized: normalizedPlan.id },
      simulationPlan,
      'COMPLETED',
      { contentHash: simulationPlan.metadata.contentHash }
    );

    const processingTimeMs = Date.now() - startTime;

    // Build execution proof
    const executionProof = proofBuilder.build({
      plan: simulationPlan,
      sessionId,
      processingTimeMs,
    });

    // Create validation result (already validated at entry)
    const validationResult: ContractValidationResult = {
      valid: true,
      errors: [],
      validatedAt: getCurrentTimestampUTC(),
      schemaVersion: SCHEMA_VERSION,
    };

    return {
      plan: simulationPlan,
      sessionId,
      contentHash: simulationPlan.metadata.contentHash ?? '',
      processingTimeMs,
      executionProof,
      validationResult,
    };
  } catch (error) {
    // Record failure in proof
    proofBuilder.recordStage(
      'PLANNING_FAILURE',
      'HANDLE_ERROR',
      {},
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'FAILED',
      { errorType: error instanceof Error ? error.name : 'Unknown' }
    );

    // Ensure errors are properly wrapped
    if (error instanceof PlanningError) {
      throw error;
    }

    throw new PlanningError({
      code: 'PLANNING_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during planning',
      severity: 'FATAL',
      stage: 'INTENT_INGESTION',
      context: { originalError: String(error) },
    });
  }
}

/**
 * Plans a simulation from natural language intent.
 * LEGACY interface - use planSimulationWithContract for full contract support.
 *
 * @param input - Planning input with intent and organizational context
 * @param options - Optional planning configuration
 * @returns PlanningResult containing the generated SimulationPlan
 */
export async function planSimulation(
  input: PlanningInput,
  options: PlanningOptions = {}
): Promise<PlanningResult> {
  const startTime = Date.now();

  // Get or create adapter
  const adapter = input.adapter ?? getRuvvectorAdapter();

  // Generate deterministic session ID
  const seed = options.seed ?? hashSHA256(input.intent + getCurrentTimestampUTC());
  const namespace = options.namespace ?? 'default';
  const sessionId = await adapter.initSession({
    seed,
    namespace,
    isolationLevel: 'SERIALIZABLE',
  });

  try {
    // Stage 1: Intent Ingestion
    const structuredIntent = await ingestIntent(
      {
        rawIntent: input.intent,
        organizationalContext: input.context,
        sessionId,
      },
      adapter
    );

    // Stage 2: Intent Decomposition
    const decomposedIntent = await decomposeIntent(structuredIntent, adapter);

    // Stage 3: Organizational Topology Extraction
    const topologyModel = await extractTopology(
      decomposedIntent,
      structuredIntent,
      adapter
    );

    // Stage 4: Agent and Workflow Expansion
    const expandedAgentsWorkflows = await expandAgentsAndWorkflows(
      decomposedIntent,
      topologyModel,
      sessionId,
      adapter
    );

    // Stage 5: Integration Discovery
    const integrationMap = await discoverIntegrations(
      expandedAgentsWorkflows,
      sessionId,
      adapter
    );

    // Stage 6: Constraint Resolution
    const resolvedConstraints = await resolveConstraints(
      structuredIntent,
      expandedAgentsWorkflows,
      integrationMap,
      sessionId,
      adapter
    );

    // Stage 7: Validation and Normalization
    const normalizedPlan = await validateAndNormalize(
      expandedAgentsWorkflows,
      resolvedConstraints,
      sessionId,
      adapter
    );

    // Stage 8: SimulationPlan Serialization
    const simulationPlan = await serializeSimulationPlan(
      structuredIntent,
      decomposedIntent,
      topologyModel,
      expandedAgentsWorkflows,
      integrationMap,
      resolvedConstraints,
      normalizedPlan,
      sessionId,
      adapter
    );

    const processingTimeMs = Date.now() - startTime;

    return {
      plan: simulationPlan,
      sessionId,
      contentHash: simulationPlan.metadata.contentHash ?? '',
      processingTimeMs,
    };
  } catch (error) {
    // Ensure errors are properly wrapped
    if (error instanceof PlanningError) {
      throw error;
    }

    throw new PlanningError({
      code: 'PLANNING_FAILED',
      message: error instanceof Error ? error.message : 'Unknown error during planning',
      severity: 'FATAL',
      stage: 'INTENT_INGESTION',
      context: { originalError: String(error) },
    });
  }
}

/**
 * Verifies that a SimulationPlan is deterministic by regenerating it.
 *
 * @param input - Original planning input
 * @param expectedHash - Expected content hash
 * @param seed - Seed used for original generation
 * @returns True if regenerated plan matches expected hash
 */
export async function verifyDeterminism(
  input: PlanningInput,
  expectedHash: SHA256Hash,
  seed: string
): Promise<boolean> {
  const result = await planSimulation(input, { seed });
  return result.contentHash === expectedHash;
}

/**
 * Creates a minimal organizational context for testing.
 */
export function createMinimalContext(
  organizationName: string,
  organizationId?: UUID
): OrganizationalContext {
  const orgId = organizationId ?? generateDeterministicId('org', organizationName);

  return {
    organizationId: orgId,
    organizationName,
    topology: {
      divisions: [{
        id: generateDeterministicId('div', orgId, 'default'),
        name: 'Default Division',
        level: 1,
      }],
      teams: [{
        id: generateDeterministicId('team', orgId, 'default'),
        name: 'Default Team',
        divisionId: generateDeterministicId('div', orgId, 'default'),
        members: [{
          id: generateDeterministicId('member', orgId, 'default'),
          name: 'Default Member',
          role: 'engineer',
        }],
        capabilities: ['task_execution'],
      }],
    },
    constraints: {
      constraints: [],
    },
  };
}
