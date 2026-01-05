/**
 * Policy Input Types for Simulation Planning
 *
 * Defines configuration policies that govern how simulations are planned.
 * These policies constrain resource allocation, costs, compliance requirements,
 * performance SLAs, and authorization during the PLANNING phase.
 *
 * Note: These policies affect simulation plan generation, not runtime execution.
 */

import type { UUID, Timestamp, Priority } from './common.js';

// ============================================================================
// Policy Type Enumeration
// ============================================================================

/**
 * Categories of policies that can be applied to simulation planning.
 * Each type has a corresponding specification interface.
 */
export type PolicyType =
  | 'RESOURCE_ALLOCATION'
  | 'COST_CONSTRAINT'
  | 'COMPLIANCE'
  | 'PERFORMANCE_SLA'
  | 'AUTHORIZATION';

/**
 * Enforcement level determines how strictly a policy is applied during planning.
 * - STRICT: Policy violations cause plan generation to fail
 * - ADVISORY: Policy violations generate warnings but allow plan generation
 * - BEST_EFFORT: Policy is applied where possible without blocking
 */
export type EnforcementLevel = 'STRICT' | 'ADVISORY' | 'BEST_EFFORT';

// ============================================================================
// Resource Allocation Policy
// ============================================================================

/**
 * Defines resource constraints for simulation planning.
 * Limits the resources that can be allocated in generated plans.
 */
export interface ResourceAllocationPolicy {
  /**
   * Maximum number of agents that can be planned for a simulation.
   * Must be a positive integer.
   */
  readonly maxAgents: number;

  /**
   * Maximum number of workflows that can execute concurrently in the plan.
   * Affects parallelization strategy selection.
   */
  readonly maxConcurrentWorkflows: number;

  /**
   * CPU limit in millicores (e.g., 1000 = 1 CPU core).
   * Used for capacity planning calculations.
   */
  readonly cpuLimit: number;

  /**
   * Memory limit in megabytes.
   * Used for capacity planning calculations.
   */
  readonly memoryLimit: number;
}

// ============================================================================
// Cost Constraint Policy
// ============================================================================

/**
 * Budget period for cost constraint calculations.
 * Determines the time window for budget enforcement.
 */
export type BudgetPeriod = 'SIMULATION' | 'HOUR' | 'DAY';

/**
 * Defines cost constraints for simulation planning.
 * Ensures generated plans stay within budget boundaries.
 */
export interface CostConstraintPolicy {
  /**
   * Maximum budget amount for the specified period.
   * Used to constrain plan complexity and resource allocation.
   */
  readonly maxBudget: number;

  /**
   * ISO 4217 currency code (e.g., 'USD', 'EUR', 'GBP').
   */
  readonly currency: string;

  /**
   * Time period over which the budget applies.
   * SIMULATION: Total budget for entire simulation
   * HOUR: Hourly budget rate
   * DAY: Daily budget rate
   */
  readonly budgetPeriod: BudgetPeriod;

  /**
   * Percentage threshold (0-100) at which to generate budget alerts.
   * When estimated cost reaches this percentage of maxBudget, a warning is raised.
   */
  readonly alertThresholdPercent: number;
}

// ============================================================================
// Compliance Policy
// ============================================================================

/**
 * Audit level determines the depth of compliance logging in plans.
 */
export type AuditLevel = 'MINIMAL' | 'STANDARD' | 'COMPREHENSIVE';

/**
 * PII handling strategy for data processed in simulations.
 * Affects how personally identifiable information is treated in plans.
 */
export type PIIHandlingStrategy = 'MASK' | 'ENCRYPT' | 'EXCLUDE';

/**
 * Defines compliance requirements for simulation planning.
 * Ensures generated plans meet regulatory and organizational requirements.
 */
export interface CompliancePolicy {
  /**
   * List of compliance frameworks that must be satisfied.
   * Examples: 'SOC2', 'GDPR', 'HIPAA', 'PCI-DSS', 'ISO27001'
   */
  readonly requiredFrameworks: readonly string[];

  /**
   * Number of days that simulation data and logs must be retained.
   * Affects checkpoint and audit trail planning.
   */
  readonly dataRetentionDays: number;

  /**
   * Level of audit logging to include in the simulation plan.
   * MINIMAL: Basic operation logs
   * STANDARD: Operation logs with input/output summaries
   * COMPREHENSIVE: Full audit trail with data lineage
   */
  readonly auditLevel: AuditLevel;

  /**
   * Strategy for handling PII in simulation plans.
   * MASK: Replace PII with masked values
   * ENCRYPT: Encrypt PII at rest and in transit
   * EXCLUDE: Remove PII from simulation scope
   */
  readonly piiHandling: PIIHandlingStrategy;
}

// ============================================================================
// Performance SLA Policy
// ============================================================================

/**
 * Defines performance service level agreements for simulation planning.
 * Constrains plans to meet latency, throughput, and availability targets.
 */
export interface PerformanceSLAPolicy {
  /**
   * Maximum acceptable latency in milliseconds for individual operations.
   * Plans will be optimized to meet this target.
   */
  readonly maxLatencyMs: number;

  /**
   * Minimum required throughput in operations per second.
   * Affects parallelization and batching strategies in plans.
   */
  readonly minThroughput: number;

  /**
   * Required availability percentage (0-100, e.g., 99.9).
   * Affects redundancy and failover planning.
   */
  readonly availabilityPercent: number;
}

// ============================================================================
// Authorization Policy
// ============================================================================

/**
 * Approval workflow requirements for sensitive operations.
 */
export type ApprovalWorkflow = 'NONE' | 'SINGLE_APPROVER' | 'MULTI_APPROVER';

/**
 * Defines authorization requirements for simulation planning.
 * Specifies roles, scopes, and approval workflows needed for plan execution.
 */
export interface AuthorizationPolicy {
  /**
   * Roles required to execute the simulation plan.
   * Examples: 'simulation-admin', 'resource-manager', 'compliance-officer'
   */
  readonly requiredRoles: readonly string[];

  /**
   * OAuth/permission scopes required for plan execution.
   * Examples: 'read:resources', 'write:workflows', 'admin:agents'
   */
  readonly requiredScopes: readonly string[];

  /**
   * Approval workflow required before plan execution.
   * NONE: No approval required
   * SINGLE_APPROVER: One authorized approver
   * MULTI_APPROVER: Multiple approvers required (quorum)
   */
  readonly approvalWorkflow: ApprovalWorkflow;
}

// ============================================================================
// Policy Specification Union
// ============================================================================

/**
 * Discriminated union of all policy specification types.
 * The specific type is determined by the parent PolicyInput's policyType field.
 */
export type PolicySpecification =
  | ResourceAllocationPolicy
  | CostConstraintPolicy
  | CompliancePolicy
  | PerformanceSLAPolicy
  | AuthorizationPolicy;

// ============================================================================
// Policy Input
// ============================================================================

/**
 * Main policy configuration input for simulation planning.
 * Defines a single policy that governs aspects of plan generation.
 */
export interface PolicyInput {
  /**
   * Unique identifier for this policy (UUID v4 format).
   */
  readonly id: UUID;

  /**
   * Human-readable name for the policy.
   * Should be descriptive and unique within a PolicySet.
   */
  readonly name: string;

  /**
   * Semantic version of the policy (e.g., '1.0.0', '2.1.3').
   * Used for policy versioning and change tracking.
   */
  readonly version: string;

  /**
   * ISO 8601 timestamp when this policy becomes effective.
   * Plans generated before this time will not apply this policy.
   */
  readonly effectiveFrom: Timestamp;

  /**
   * ISO 8601 timestamp when this policy expires.
   * Null indicates the policy has no expiration.
   */
  readonly effectiveUntil: Timestamp | null;

  /**
   * Type of policy, determines which specification interface applies.
   */
  readonly policyType: PolicyType;

  /**
   * Policy-specific configuration based on policyType.
   */
  readonly specification: PolicySpecification;

  /**
   * Priority level for conflict resolution.
   * Higher priority policies take precedence when conflicts occur.
   */
  readonly priority: Priority;

  /**
   * How strictly this policy should be enforced during planning.
   */
  readonly enforcementLevel: EnforcementLevel;
}

// ============================================================================
// Policy Conflict Resolution
// ============================================================================

/**
 * Resolution status for policy conflicts.
 */
export type ConflictResolution = 'UNRESOLVED' | 'A_WINS' | 'B_WINS' | 'MERGED';

/**
 * Represents a conflict between two policies in a PolicySet.
 * Conflicts occur when policies have incompatible requirements.
 */
export interface PolicyConflict {
  /**
   * UUID of the first conflicting policy.
   */
  readonly policyA: UUID;

  /**
   * UUID of the second conflicting policy.
   */
  readonly policyB: UUID;

  /**
   * Description of the conflict type.
   * Examples: 'RESOURCE_LIMIT_EXCEEDED', 'INCOMPATIBLE_COMPLIANCE', 'BUDGET_CONFLICT'
   */
  readonly conflictType: string;

  /**
   * Human-readable description of the conflict.
   */
  readonly description?: string;

  /**
   * How the conflict was or should be resolved.
   * UNRESOLVED: Conflict not yet addressed
   * A_WINS: Policy A takes precedence
   * B_WINS: Policy B takes precedence
   * MERGED: Policies were merged into compatible requirements
   */
  readonly resolution: ConflictResolution;
}

// ============================================================================
// Policy Set
// ============================================================================

/**
 * Validation status for a PolicySet.
 */
export type PolicySetValidationStatus = 'PENDING' | 'VALID' | 'CONFLICT_DETECTED';

/**
 * Collection of policies applied to a simulation.
 * Includes validation status and any detected conflicts.
 */
export interface PolicySet {
  /**
   * Collection of policies to apply to simulation planning.
   * Policies are evaluated in priority order.
   */
  readonly policies: readonly PolicyInput[];

  /**
   * Current validation status of the policy set.
   * PENDING: Validation not yet performed
   * VALID: All policies are compatible
   * CONFLICT_DETECTED: One or more conflicts found
   */
  readonly validationStatus: PolicySetValidationStatus;

  /**
   * List of detected conflicts between policies.
   * Empty when validationStatus is VALID or PENDING.
   */
  readonly conflicts: readonly PolicyConflict[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a specification is a ResourceAllocationPolicy.
 */
export function isResourceAllocationPolicy(
  spec: PolicySpecification
): spec is ResourceAllocationPolicy {
  return (
    'maxAgents' in spec &&
    'maxConcurrentWorkflows' in spec &&
    'cpuLimit' in spec &&
    'memoryLimit' in spec
  );
}

/**
 * Type guard to check if a specification is a CostConstraintPolicy.
 */
export function isCostConstraintPolicy(
  spec: PolicySpecification
): spec is CostConstraintPolicy {
  return (
    'maxBudget' in spec &&
    'currency' in spec &&
    'budgetPeriod' in spec &&
    'alertThresholdPercent' in spec
  );
}

/**
 * Type guard to check if a specification is a CompliancePolicy.
 */
export function isCompliancePolicy(
  spec: PolicySpecification
): spec is CompliancePolicy {
  return (
    'requiredFrameworks' in spec &&
    'dataRetentionDays' in spec &&
    'auditLevel' in spec &&
    'piiHandling' in spec
  );
}

/**
 * Type guard to check if a specification is a PerformanceSLAPolicy.
 */
export function isPerformanceSLAPolicy(
  spec: PolicySpecification
): spec is PerformanceSLAPolicy {
  return (
    'maxLatencyMs' in spec &&
    'minThroughput' in spec &&
    'availabilityPercent' in spec
  );
}

/**
 * Type guard to check if a specification is an AuthorizationPolicy.
 */
export function isAuthorizationPolicy(
  spec: PolicySpecification
): spec is AuthorizationPolicy {
  return (
    'requiredRoles' in spec &&
    'requiredScopes' in spec &&
    'approvalWorkflow' in spec
  );
}

// ============================================================================
// Factory Helpers
// ============================================================================

/**
 * Creates an empty PolicySet with pending validation status.
 */
export function createEmptyPolicySet(): PolicySet {
  return {
    policies: [],
    validationStatus: 'PENDING',
    conflicts: [],
  };
}

/**
 * Creates a PolicySet from an array of policies.
 * Validation status is set to PENDING until explicit validation.
 */
export function createPolicySet(policies: readonly PolicyInput[]): PolicySet {
  return {
    policies,
    validationStatus: 'PENDING',
    conflicts: [],
  };
}
