/**
 * SimulationPlan type definitions
 * Defines the final output schema as per SimulationPlan JSON Schema v2.0.
 *
 * IMPORTANT: The SimulationPlan is a PLANNING artifact that describes
 * WHAT should be simulated. It does NOT perform execution, ROI calculations,
 * or ERP data normalization. Those are the responsibility of:
 * - agentics-simulation-runner: Execution
 * - analytics-service: ROI calculations
 * - erp-adapter: ERP data normalization
 */

import type {
  UUID,
  Timestamp,
  SHA256Hash,
  ObjectiveType,
  ExecutionStrategy,
  ExecutionNodeType,
  ExecutionEdgeType,
} from './common.js';
import type { SimulationScope, SimulationScopeValidation } from './simulation-scope.js';
import type { PolicySet } from './policy-input.js';
import type { OutputArtifactManifest } from './output-artifact.js';
import type { ERPSurfaceReference, ERPIntegrationRequirement } from './erp-surface.js';

/** SimulationPlan metadata */
export interface SimulationPlanMetadata {
  readonly planId: UUID;
  readonly createdAt: Timestamp;
  readonly sourceIntent: string;
  readonly traceId: UUID;
  readonly plannerVersion: string;
  readonly generationSessionId: UUID;
  readonly contentHash?: SHA256Hash;
}

/** Objective target specification */
export interface ObjectiveTarget {
  readonly metric: string;
  readonly value: number;
  readonly unit?: string;
  readonly baseline?: number;
}

/** Objective in SimulationPlan */
export interface SimulationObjective {
  readonly objectiveId: UUID;
  readonly type: ObjectiveType;
  readonly target: ObjectiveTarget;
  readonly priority: number;
  readonly description?: string;
}

/** Agent allocation */
export interface AgentAllocation {
  readonly count: number;
  readonly distribution: string;
  readonly constraints?: Record<string, unknown>;
}

/** Serialized agent in SimulationPlan */
export interface SerializedAgent {
  readonly agentId: UUID;
  readonly type: string;
  readonly capabilities: readonly string[];
  readonly allocation: AgentAllocation;
  readonly teamId?: UUID;
  readonly role?: string;
  readonly endpoints?: readonly SerializedEndpoint[];
  readonly objectives?: readonly UUID[];
  readonly resources?: SerializedResources;
}

/** Serialized endpoint */
export interface SerializedEndpoint {
  readonly protocol: string;
  readonly direction: string;
  readonly messageTypes: readonly string[];
}

/** Serialized resources */
export interface SerializedResources {
  readonly cpu?: number;
  readonly memory?: number;
  readonly storage?: number;
}

/** Temporal constraints */
export interface TemporalConstraints {
  readonly startAfter?: Timestamp;
  readonly completeBefore?: Timestamp;
  readonly maxDuration?: number;
  readonly timezone?: string;
}

/** Resource constraints */
export interface ResourceConstraints {
  readonly maxAgents?: number;
  readonly maxConcurrency?: number;
  readonly maxMemory?: number;
  readonly maxCost?: number;
}

/** Dependency constraint */
export interface DependencyConstraint {
  readonly from: UUID;
  readonly to: UUID;
  readonly type: string;
}

/** Constraints in SimulationPlan */
export interface SimulationConstraints {
  readonly temporal?: TemporalConstraints;
  readonly resource?: ResourceConstraints;
  readonly dependency?: readonly DependencyConstraint[];
}

/** Execution phase */
export interface ExecutionPhase {
  readonly phaseId: UUID;
  readonly name: string;
  readonly order: number;
  readonly objectives: readonly UUID[];
  readonly agents: readonly UUID[];
  readonly dependencies?: readonly UUID[];
}

/** Execution configuration */
export interface ExecutionConfig {
  readonly strategy: ExecutionStrategy;
  readonly phases: readonly ExecutionPhase[];
  readonly checkpoints?: readonly UUID[];
  readonly rollbackPolicy?: string;
}

/** Execution graph node */
export interface ExecutionNode {
  readonly id: UUID;
  readonly type: ExecutionNodeType;
  readonly workflowId?: UUID;
  readonly agentId?: UUID;
  readonly order: number;
}

/** Execution graph edge */
export interface ExecutionEdge {
  readonly from: UUID;
  readonly to: UUID;
  readonly type: ExecutionEdgeType;
  readonly dataType?: string;
}

/** Execution graph */
export interface ExecutionGraph {
  readonly nodes: readonly ExecutionNode[];
  readonly edges: readonly ExecutionEdge[];
}

/** Aggregated resource requirements */
export interface AggregatedResourceRequirements {
  readonly totalCpu: number;
  readonly totalMemory: number;
  readonly totalStorage: number;
  readonly peakAgents: number;
  readonly estimatedDuration?: number;
}

/** Validation status in SimulationPlan */
export interface SimulationValidationStatus {
  readonly schemaValid: boolean;
  readonly semanticallyConsistent: boolean;
  readonly constraintsSatisfied: boolean;
  readonly integrationsResolved: boolean;
  readonly validatedAt: Timestamp;
}

/** Serialized workflow step */
export interface SerializedStep {
  readonly id: UUID;
  readonly order: number;
  readonly objective: UUID;
  readonly agent: UUID;
  readonly inputs: readonly SerializedInput[];
  readonly outputs: readonly SerializedOutput[];
  readonly preconditions: readonly SerializedCondition[];
  readonly postconditions: readonly SerializedCondition[];
}

/** Serialized input */
export interface SerializedInput {
  readonly sourceStepId: UUID | null;
  readonly dataType: string;
}

/** Serialized output */
export interface SerializedOutput {
  readonly name: string;
  readonly dataType: string;
}

/** Serialized condition */
export interface SerializedCondition {
  readonly type: string;
  readonly specification: string;
}

/** Serialized workflow */
export interface SerializedWorkflow {
  readonly id: UUID;
  readonly name: string;
  readonly objectives: readonly UUID[];
  readonly parallelization: string;
  readonly steps: readonly SerializedStep[];
}

/** Serialized integration */
export interface SerializedIntegration {
  readonly id: UUID;
  readonly capability: string;
  readonly provider: string;
  readonly version: string;
  readonly endpoint?: string;
  readonly inputSchema?: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
}

/** Serialized constraint */
export interface SerializedConstraint {
  readonly id: UUID;
  readonly type: string;
  readonly specification: unknown;
  readonly priority: string;
  readonly target?: string;
}

/** Audit trail entry */
export interface AuditEntry {
  readonly stage: string;
  readonly operation: string;
  readonly inputHash?: SHA256Hash;
  readonly inputId?: UUID;
  readonly inputIds?: readonly UUID[];
  readonly outputId?: UUID;
  readonly timestamp: Timestamp;
  readonly decision: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly severity?: string;
  readonly context?: Record<string, unknown>;
  readonly metrics?: Record<string, unknown>;
  readonly contentHash?: SHA256Hash;
  readonly tokenCount?: number;
  readonly objectiveCount?: number;
}

/**
 * Target engine specification for the simulation plan.
 * Explicitly declares which execution engine this plan is designed for.
 */
export interface TargetEngineSpec {
  /**
   * The target simulation engine identifier.
   * Currently only 'agentics-simulation-runner' is supported.
   */
  readonly engine: 'agentics-simulation-runner';

  /**
   * Semantic version constraint for engine compatibility.
   * @example '>=1.0.0 <2.0.0', '^1.5.0', '1.x'
   */
  readonly versionConstraint: string;

  /**
   * Required engine capabilities for this plan.
   * The engine must support all listed capabilities.
   */
  readonly requiredCapabilities?: readonly string[];
}

/**
 * Complete SimulationPlan output.
 *
 * This is the PRIMARY output of the agentics-simulation-planner.
 * It describes WHAT should be simulated, including:
 * - Simulation scope and boundaries
 * - ERP surface dependencies
 * - Policy inputs and constraints
 * - Expected output artifacts
 *
 * The plan is consumed by agentics-simulation-runner for execution.
 * The planner NEVER executes simulations, calculates ROI, or normalizes ERP data.
 */
export interface SimulationPlan {
  readonly version: string;
  readonly metadata: SimulationPlanMetadata;

  /**
   * Target engine specification.
   * Explicitly declares which engine should execute this plan.
   */
  readonly targetEngine?: TargetEngineSpec;

  /**
   * Simulation scope definition.
   * Defines what domains, capabilities, and time horizons are in scope.
   */
  readonly scope?: SimulationScope;

  /**
   * Scope validation results.
   * Contains the validation status and complexity estimate.
   */
  readonly scopeValidation?: SimulationScopeValidation;

  readonly objectives: readonly SimulationObjective[];
  readonly agents: readonly SerializedAgent[];
  readonly constraints: SimulationConstraints;
  readonly execution: ExecutionConfig;
  readonly workflows?: readonly SerializedWorkflow[];
  readonly integrations?: readonly SerializedIntegration[];

  /**
   * ERP surface references.
   * Explicitly declares which ERP surfaces this simulation depends on.
   * These are abstract references - actual ERP data is fetched by erp-adapter.
   */
  readonly erpSurfaces?: readonly ERPSurfaceReference[];

  /**
   * ERP integration requirements.
   * Detailed requirements for ERP data needed by the simulation.
   */
  readonly erpRequirements?: readonly ERPIntegrationRequirement[];

  /**
   * Policy inputs that govern simulation behavior.
   * Policies are evaluated during planning, not execution.
   */
  readonly policies?: PolicySet;

  /**
   * Output artifact manifest.
   * Describes what artifacts the simulation will produce for downstream systems.
   * The planner describes artifacts; the engine generates them.
   */
  readonly outputArtifacts?: OutputArtifactManifest;

  readonly executionGraph?: ExecutionGraph;
  readonly resourceRequirements?: AggregatedResourceRequirements;
  readonly validationStatus?: SimulationValidationStatus;
  readonly auditTrail?: readonly AuditEntry[];
}
