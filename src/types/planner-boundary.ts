/**
 * Planner Boundary Types
 *
 * This module defines the explicit boundaries of what the simulation planner
 * CAN and CANNOT do. These boundaries exist to enforce SEPARATION OF CONCERNS
 * and prevent scope creep in the planning pipeline.
 *
 * ## Why Boundaries Matter
 *
 * The agentics-simulation-planner is a PLANNING tool, not an EXECUTION engine.
 * Its sole responsibility is to transform user intent into a deterministic,
 * serializable simulation plan that downstream systems can execute.
 *
 * ### The Planner's Responsibility
 * - Parse and understand user intent
 * - Decompose high-level objectives into structured components
 * - Extract organizational topology from context
 * - Discover required integrations and ERP surfaces
 * - Resolve constraints and dependencies
 * - Validate the plan structure
 * - Serialize the plan for downstream consumption
 *
 * ### What the Planner Must NEVER Do
 * - Execute simulations (that's agentics-simulation-engine's job)
 * - Calculate financial metrics like ROI (that's analytics' job)
 * - Normalize or transform ERP data (that's ERP adapter's job)
 * - Make runtime API calls (no side effects during planning)
 * - Mutate any external state (planning is read-only)
 * - Process actual transactions (planning describes, doesn't execute)
 * - Generate reports (reports are downstream artifacts)
 * - Schedule jobs (orchestration handles scheduling)
 *
 * ### Architectural Principle
 * By keeping the planner "pure" (no side effects, deterministic output),
 * we gain:
 * 1. Testability - Plans can be verified without mocking external systems
 * 2. Reproducibility - Same input always produces same plan
 * 3. Debuggability - Plans can be inspected before execution
 * 4. Composability - Plans can be combined, split, or transformed
 * 5. Auditability - Complete trace from intent to plan
 *
 * @module planner-boundary
 */

import type { PipelineStage } from './common.js';

/**
 * Operations the planner IS allowed to perform.
 *
 * These are the core competencies of the planning pipeline.
 * Each operation transforms input data into structured output
 * without side effects.
 */
export type PlannerOperation =
  /**
   * Parse and understand user-provided intent text.
   * Extracts structure from natural language descriptions.
   */
  | 'PARSE_INTENT'
  /**
   * Break down high-level objectives into atomic, actionable components.
   * Creates the objective hierarchy for the simulation plan.
   */
  | 'DECOMPOSE_OBJECTIVES'
  /**
   * Extract organizational structure (teams, divisions, roles) from context.
   * Builds the topology graph that agents will operate within.
   */
  | 'EXTRACT_TOPOLOGY'
  /**
   * Identify required ERP systems, APIs, and external integrations.
   * Discovers what systems the simulation will need to interact with.
   */
  | 'DISCOVER_INTEGRATIONS'
  /**
   * Resolve conflicts between constraints and validate dependencies.
   * Ensures the plan is internally consistent and achievable.
   */
  | 'RESOLVE_CONSTRAINTS'
  /**
   * Validate the complete plan against schema and business rules.
   * Ensures the plan is well-formed before serialization.
   */
  | 'VALIDATE_PLAN'
  /**
   * Serialize the plan to JSON/YAML for storage and transmission.
   * Produces the final artifact consumed by downstream systems.
   */
  | 'SERIALIZE_PLAN'
  /**
   * Define the scope boundaries of what the simulation will cover.
   * Explicitly sets what is in-scope and out-of-scope.
   */
  | 'DEFINE_SCOPE'
  /**
   * Specify which ERP data surfaces the simulation depends on.
   * Declares data requirements without fetching the data.
   */
  | 'SPECIFY_ERP_DEPENDENCIES'
  /**
   * Declare what policy inputs the simulation requires.
   * Specifies policy parameters without evaluating them.
   */
  | 'DECLARE_POLICY_INPUTS'
  /**
   * Describe the artifacts the simulation will produce.
   * Documents expected outputs without generating them.
   */
  | 'DESCRIBE_OUTPUT_ARTIFACTS';

/**
 * Operations the planner MUST NOT perform.
 *
 * These operations are explicitly prohibited because they:
 * 1. Cause side effects (violates planning purity)
 * 2. Belong to different system components (violates separation of concerns)
 * 3. Require runtime context unavailable during planning
 * 4. Would couple planning to execution (architectural anti-pattern)
 *
 * Attempting any of these operations should trigger a BoundaryViolation.
 */
export type ProhibitedOperation =
  /**
   * PROHIBITED: Execution belongs to agentics-simulation-engine.
   *
   * The planner produces a plan; the engine executes it.
   * Mixing these concerns would:
   * - Make plans non-portable between engines
   * - Prevent plan validation before execution
   * - Couple planning to specific runtime environments
   */
  | 'EXECUTE_SIMULATION'
  /**
   * PROHIBITED: ROI calculations belong to finance/analytics systems.
   *
   * Financial calculations require:
   * - Access to financial data the planner shouldn't have
   * - Business logic that varies by organization
   * - Audit trails that belong in financial systems
   */
  | 'CALCULATE_ROI'
  /**
   * PROHIBITED: ERP data normalization belongs to ERP adapters.
   *
   * The planner specifies WHAT data is needed, not HOW to get it.
   * Normalization logic is:
   * - ERP-vendor-specific
   * - Subject to frequent changes
   * - A separate concern from planning
   */
  | 'NORMALIZE_ERP_DATA'
  /**
   * PROHIBITED: No runtime API calls during planning.
   *
   * Planning must be deterministic. External API calls:
   * - Introduce non-determinism (network failures, data changes)
   * - Create implicit dependencies on service availability
   * - Make plans impossible to test in isolation
   */
  | 'CALL_EXTERNAL_APIS'
  /**
   * PROHIBITED: The planner must never mutate ERP state.
   *
   * Planning is a read-only operation. State mutations:
   * - Cannot be undone if planning fails
   * - Violate the principle of least privilege
   * - Belong exclusively to execution phase
   */
  | 'MUTATE_ERP_STATE'
  /**
   * PROHIBITED: Transaction processing is an execution concern.
   *
   * The planner describes what transactions SHOULD occur;
   * it never processes actual transactions. This ensures:
   * - No financial impact from planning errors
   * - Clear separation of planning and execution liability
   * - Ability to simulate without real-world consequences
   */
  | 'PROCESS_TRANSACTIONS'
  /**
   * PROHIBITED: Reports are downstream artifacts.
   *
   * The planner may describe what reports to generate,
   * but actual report generation is a post-execution activity.
   * Reports require execution results the planner doesn't have.
   */
  | 'GENERATE_REPORTS'
  /**
   * PROHIBITED: Job scheduling belongs to orchestration layer.
   *
   * The planner defines WHAT should happen and in WHAT ORDER,
   * but WHEN and WHERE jobs run is an orchestration concern.
   * This separation allows the same plan to run in different
   * scheduling environments (cron, Kubernetes, cloud functions).
   */
  | 'SCHEDULE_JOBS';

/**
 * Systems to which operations are delegated.
 *
 * Each system has clear responsibilities and well-defined interfaces
 * for receiving work from the planner.
 */
export type DelegationTarget =
  /**
   * The simulation execution engine.
   * Receives serialized plans and executes agent workflows.
   */
  | 'agentics-simulation-engine'
  /**
   * ERP system adapters.
   * Handle data normalization, transformation, and state mutations.
   */
  | 'erp-adapter'
  /**
   * Analytics and business intelligence services.
   * Handle ROI calculations, report generation, and metrics.
   */
  | 'analytics-service'
  /**
   * Workflow orchestration layer.
   * Handles job scheduling, execution coordination, and monitoring.
   */
  | 'orchestration-layer';

/**
 * Describes an operation that the planner explicitly delegates
 * to another system component.
 *
 * Delegation is documented to:
 * 1. Make architectural boundaries explicit
 * 2. Provide clear handoff contracts
 * 3. Enable tracing of responsibility
 */
export interface DelegatedOperation {
  /**
   * The operation being delegated.
   */
  readonly operation: ProhibitedOperation;

  /**
   * The system receiving this delegation.
   */
  readonly delegatedTo: DelegationTarget;

  /**
   * Reference to the interface or schema defining the handoff contract.
   *
   * This should be a path to a schema file or interface name that
   * defines the exact data format passed between systems.
   *
   * @example "SimulationPlan" - for plan handoff to engine
   * @example "ERPDataRequest" - for ERP data requirements
   */
  readonly handoffContract: string;

  /**
   * Human-readable description of why this delegation exists.
   */
  readonly rationale: string;
}

/**
 * Represents a detected boundary violation.
 *
 * Violations are FATAL by default because they indicate
 * architectural issues that must be fixed, not worked around.
 */
export interface BoundaryViolation {
  /**
   * The prohibited operation that was attempted.
   */
  readonly violationType: ProhibitedOperation;

  /**
   * Pipeline stage where the violation was detected.
   */
  readonly detectedAt: PipelineStage;

  /**
   * Contextual information about what triggered the violation.
   */
  readonly context: string;

  /**
   * Severity of the violation.
   *
   * - FATAL: Planning must abort immediately
   * - ERROR: Planning should fail after collecting all violations
   */
  readonly severity: 'FATAL' | 'ERROR';

  /**
   * The correct system that should handle this operation.
   */
  readonly correctHandler: DelegationTarget | null;

  /**
   * Suggested remediation for the violation.
   */
  readonly remediation: string;
}

/**
 * Result of a boundary check operation.
 */
export interface BoundaryCheckResult {
  /**
   * Whether the operation is allowed within planner boundaries.
   */
  readonly allowed: boolean;

  /**
   * Violation details if the operation is not allowed.
   */
  readonly violation: BoundaryViolation | null;

  /**
   * Suggested alternative if the operation is prohibited.
   */
  readonly suggestion: string | null;
}

/**
 * Interface for checking operations against planner boundaries.
 *
 * Implementations of this interface act as gatekeepers,
 * preventing prohibited operations from being attempted.
 */
export interface BoundaryGuard {
  /**
   * Check whether an operation is allowed within planner boundaries.
   *
   * @param operation - The operation identifier to check
   * @param context - Additional context for violation reporting
   * @returns Result indicating if operation is allowed
   */
  checkOperation(
    operation: string,
    context: Record<string, unknown>
  ): BoundaryCheckResult;

  /**
   * Quick check if an operation is in the prohibited list.
   *
   * @param operation - The operation identifier to check
   * @returns true if the operation is prohibited
   */
  isProhibited(operation: string): boolean;

  /**
   * Get the delegation target for a prohibited operation.
   *
   * @param operation - The prohibited operation
   * @returns The system that should handle this operation, or null
   */
  getDelegationTarget(operation: ProhibitedOperation): DelegationTarget | null;

  /**
   * Get remediation guidance for a prohibited operation.
   *
   * @param operation - The prohibited operation
   * @returns Guidance on how to properly handle the operation
   */
  getRemediation(operation: ProhibitedOperation): string;
}

/**
 * Complete boundary specification for the planner.
 *
 * This interface defines the full set of boundaries that
 * govern planner behavior.
 */
export interface PlannerBoundary {
  /**
   * Operations the planner is allowed to perform.
   * These form the core competencies of the planning pipeline.
   */
  readonly allowedOperations: readonly PlannerOperation[];

  /**
   * Operations the planner must never perform.
   * Attempting these triggers immediate violation.
   */
  readonly prohibitedOperations: readonly ProhibitedOperation[];

  /**
   * Operations explicitly delegated to other systems.
   * Documents the architectural boundaries.
   */
  readonly delegatedOperations: readonly DelegatedOperation[];

  /**
   * Version of the boundary specification.
   * Used for compatibility checking.
   */
  readonly version: string;
}

/**
 * All allowed planner operations as a readonly array.
 *
 * This constant can be used for validation and iteration.
 */
export const ALLOWED_PLANNER_OPERATIONS: readonly PlannerOperation[] = [
  'PARSE_INTENT',
  'DECOMPOSE_OBJECTIVES',
  'EXTRACT_TOPOLOGY',
  'DISCOVER_INTEGRATIONS',
  'RESOLVE_CONSTRAINTS',
  'VALIDATE_PLAN',
  'SERIALIZE_PLAN',
  'DEFINE_SCOPE',
  'SPECIFY_ERP_DEPENDENCIES',
  'DECLARE_POLICY_INPUTS',
  'DESCRIBE_OUTPUT_ARTIFACTS',
] as const;

/**
 * All prohibited planner operations as a readonly array.
 *
 * This constant can be used for validation and boundary checking.
 */
export const PROHIBITED_PLANNER_OPERATIONS: readonly ProhibitedOperation[] = [
  'EXECUTE_SIMULATION',
  'CALCULATE_ROI',
  'NORMALIZE_ERP_DATA',
  'CALL_EXTERNAL_APIS',
  'MUTATE_ERP_STATE',
  'PROCESS_TRANSACTIONS',
  'GENERATE_REPORTS',
  'SCHEDULE_JOBS',
] as const;

/**
 * Default delegated operations with their handoff contracts.
 *
 * Each delegation documents:
 * - Which operation is being delegated
 * - Which system receives the delegation
 * - What contract governs the handoff
 * - Why this delegation exists
 */
export const DEFAULT_DELEGATED_OPERATIONS: readonly DelegatedOperation[] = [
  {
    operation: 'EXECUTE_SIMULATION',
    delegatedTo: 'agentics-simulation-engine',
    handoffContract: 'SimulationPlan',
    rationale:
      'Execution requires runtime agent orchestration, state management, ' +
      'and event handling that are outside planning scope.',
  },
  {
    operation: 'CALCULATE_ROI',
    delegatedTo: 'analytics-service',
    handoffContract: 'FinancialMetricsRequest',
    rationale:
      'ROI calculations require financial data access, business rules, ' +
      'and audit capabilities that belong in financial systems.',
  },
  {
    operation: 'NORMALIZE_ERP_DATA',
    delegatedTo: 'erp-adapter',
    handoffContract: 'ERPDataRequest',
    rationale:
      'ERP data normalization is vendor-specific and requires adapters ' +
      'that understand each ERP system\'s data model.',
  },
  {
    operation: 'CALL_EXTERNAL_APIS',
    delegatedTo: 'agentics-simulation-engine',
    handoffContract: 'IntegrationSpec',
    rationale:
      'API calls during planning would introduce non-determinism. ' +
      'The plan specifies integrations; the engine calls them.',
  },
  {
    operation: 'MUTATE_ERP_STATE',
    delegatedTo: 'erp-adapter',
    handoffContract: 'ERPMutationRequest',
    rationale:
      'State mutations have real-world consequences and must only occur ' +
      'during controlled execution with proper rollback capability.',
  },
  {
    operation: 'PROCESS_TRANSACTIONS',
    delegatedTo: 'erp-adapter',
    handoffContract: 'TransactionBatch',
    rationale:
      'Transaction processing requires ACID guarantees and integration ' +
      'with financial systems that the planner cannot provide.',
  },
  {
    operation: 'GENERATE_REPORTS',
    delegatedTo: 'analytics-service',
    handoffContract: 'ReportDefinition',
    rationale:
      'Reports require execution results. The planner defines what reports ' +
      'to generate; analytics generates them post-execution.',
  },
  {
    operation: 'SCHEDULE_JOBS',
    delegatedTo: 'orchestration-layer',
    handoffContract: 'ScheduleDefinition',
    rationale:
      'Job scheduling depends on infrastructure and timing that varies ' +
      'by deployment environment. The plan is schedule-agnostic.',
  },
] as const;

/**
 * Default planner boundary configuration.
 *
 * This configuration enforces the separation of concerns that makes
 * the agentics-simulation-planner reliable and composable.
 *
 * ## Usage
 *
 * ```typescript
 * import { DEFAULT_PLANNER_BOUNDARY } from './planner-boundary.js';
 *
 * // Check if an operation is allowed
 * const isAllowed = DEFAULT_PLANNER_BOUNDARY.allowedOperations.includes(operation);
 *
 * // Get delegation target for prohibited operation
 * const delegation = DEFAULT_PLANNER_BOUNDARY.delegatedOperations
 *   .find(d => d.operation === operation);
 * ```
 */
export const DEFAULT_PLANNER_BOUNDARY: PlannerBoundary = {
  version: '1.0.0',
  allowedOperations: ALLOWED_PLANNER_OPERATIONS,
  prohibitedOperations: PROHIBITED_PLANNER_OPERATIONS,
  delegatedOperations: DEFAULT_DELEGATED_OPERATIONS,
} as const;

/**
 * Type guard to check if a string is a valid PlannerOperation.
 *
 * @param value - The string to check
 * @returns true if the value is a valid PlannerOperation
 */
export function isPlannerOperation(value: string): value is PlannerOperation {
  return ALLOWED_PLANNER_OPERATIONS.includes(value as PlannerOperation);
}

/**
 * Type guard to check if a string is a ProhibitedOperation.
 *
 * @param value - The string to check
 * @returns true if the value is a prohibited operation
 */
export function isProhibitedOperation(value: string): value is ProhibitedOperation {
  return PROHIBITED_PLANNER_OPERATIONS.includes(value as ProhibitedOperation);
}

/**
 * Create a BoundaryViolation for a prohibited operation.
 *
 * @param operation - The prohibited operation attempted
 * @param stage - The pipeline stage where detected
 * @param context - Additional context
 * @returns A fully populated BoundaryViolation
 */
export function createBoundaryViolation(
  operation: ProhibitedOperation,
  stage: PipelineStage,
  context: string
): BoundaryViolation {
  const delegation = DEFAULT_DELEGATED_OPERATIONS.find(
    d => d.operation === operation
  );

  return {
    violationType: operation,
    detectedAt: stage,
    context,
    severity: 'FATAL',
    correctHandler: delegation?.delegatedTo ?? null,
    remediation: delegation
      ? `This operation should be delegated to ${delegation.delegatedTo} ` +
        `using the ${delegation.handoffContract} contract. ${delegation.rationale}`
      : `This operation is prohibited and has no defined delegation.`,
  };
}

/**
 * Get the delegation target for a prohibited operation.
 *
 * @param operation - The prohibited operation
 * @returns The delegation target, or null if not found
 */
export function getDelegationTarget(
  operation: ProhibitedOperation
): DelegationTarget | null {
  const delegation = DEFAULT_DELEGATED_OPERATIONS.find(
    d => d.operation === operation
  );
  return delegation?.delegatedTo ?? null;
}

/**
 * Get the handoff contract for a delegated operation.
 *
 * @param operation - The prohibited operation
 * @returns The handoff contract name, or null if not found
 */
export function getHandoffContract(operation: ProhibitedOperation): string | null {
  const delegation = DEFAULT_DELEGATED_OPERATIONS.find(
    d => d.operation === operation
  );
  return delegation?.handoffContract ?? null;
}
