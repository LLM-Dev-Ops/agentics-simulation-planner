/**
 * Core Planner - Main Entry Point
 * Orchestrates the complete planning pipeline for generating SimulationPlans.
 */

import type {
  UUID,
  SHA256Hash,
  SimulationPlan,
  OrganizationalContext,
  RuvvectorAdapter,
} from '../types/index.js';
import { PlanningError } from '../types/errors.js';
import { generateDeterministicId, hashSHA256 } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';
import { getRuvvectorAdapter, InMemoryRuvvectorAdapter } from '../adapters/ruvvector-adapter.js';
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

/** Input for the planning process */
export interface PlanningInput {
  /** Natural language organizational goal */
  readonly intent: string;
  /** Organizational context with topology and constraints */
  readonly context: OrganizationalContext;
  /** Optional custom adapter (uses default if not provided) */
  readonly adapter?: RuvvectorAdapter;
}

/** Result of the planning process */
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
 * Plans a simulation from natural language intent.
 * This is the main entry point for the agentics-simulation-planner.
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
