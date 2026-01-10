/**
 * @agentics/contracts - Contract Types
 * Type definitions for simulation planning contracts.
 * These types enforce strict request validation at the entry point.
 */

import type { UUID, Timestamp, SHA256Hash } from '../types/common.js';

/**
 * Target engine specification for simulation execution.
 */
export interface ContractTargetEngine {
  readonly engine: 'agentics-simulation-engine';
  readonly versionConstraint: string;
  readonly requiredCapabilities?: readonly string[];
}

/**
 * Time horizon for simulation scope.
 */
export interface ContractTimeHorizon {
  readonly startDate?: Timestamp;
  readonly endDate?: Timestamp;
  readonly granularity?: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
}

/**
 * Data volume bounds for simulation scope.
 */
export interface ContractDataVolume {
  readonly minRecords?: number;
  readonly maxRecords?: number;
  readonly estimatedRecords?: number;
}

/**
 * Scope configuration for simulation planning.
 */
export interface ContractScopeConfig {
  readonly type?: 'FULL' | 'PARTIAL' | 'INCREMENTAL';
  readonly domains?: readonly (
    | 'FINANCE'
    | 'HUMAN_RESOURCES'
    | 'OPERATIONS'
    | 'SUPPLY_CHAIN'
    | 'CUSTOMER_RELATIONSHIP'
    | 'PROJECT_MANAGEMENT'
    | 'ASSET_MANAGEMENT'
    | 'PROCUREMENT'
  )[];
  readonly timeHorizon?: ContractTimeHorizon;
  readonly dataVolume?: ContractDataVolume;
}

/**
 * Temporal constraints for planning.
 */
export interface ContractTemporalConstraints {
  readonly startAfter?: Timestamp;
  readonly completeBefore?: Timestamp;
  readonly maxDurationMs?: number;
  readonly timezone?: string;
}

/**
 * Resource constraints for planning.
 */
export interface ContractResourceConstraints {
  readonly maxAgents?: number;
  readonly maxConcurrency?: number;
  readonly maxMemoryMB?: number;
  readonly maxCost?: number;
}

/**
 * Constraints configuration.
 */
export interface ContractConstraintsConfig {
  readonly temporal?: ContractTemporalConstraints;
  readonly resource?: ContractResourceConstraints;
}

/**
 * Policies configuration.
 */
export interface ContractPoliciesConfig {
  readonly executionMode?: 'strict' | 'lenient' | 'adaptive';
  readonly failureHandling?: 'fail-fast' | 'continue' | 'retry';
  readonly auditLevel?: 'minimal' | 'standard' | 'detailed' | 'full';
}

/**
 * Simulation configuration as defined in request contract.
 */
export interface ContractSimulationConfig {
  readonly targetEngine?: ContractTargetEngine;
  readonly scope?: ContractScopeConfig;
  readonly constraints?: ContractConstraintsConfig;
  readonly policies?: ContractPoliciesConfig;
}

/**
 * Scenario assumption.
 */
export interface ContractScenarioAssumption {
  readonly id: UUID;
  readonly statement: string;
  readonly category?: 'technical' | 'business' | 'operational' | 'environmental';
  readonly confidence?: number;
}

/**
 * Scenario definition for constrained planning.
 */
export interface ContractScenarioDefinition {
  readonly scenarioId: UUID;
  readonly name: string;
  readonly description?: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly assumptions?: readonly ContractScenarioAssumption[];
  readonly dependencies?: readonly UUID[];
}

/**
 * Validated simulation planning request.
 * This is the canonical request type after contract validation.
 */
export interface ValidatedPlanningRequest {
  readonly intent: string;
  readonly organizationId?: UUID;
  readonly organizationName?: string;
  readonly seed?: string;
  readonly namespace?: string;
  readonly config?: ContractSimulationConfig;
  readonly scenario?: ContractScenarioDefinition;
}

/**
 * Contract validation error detail.
 */
export interface ContractValidationErrorDetail {
  readonly path: string;
  readonly message: string;
  readonly keyword?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * Contract validation result.
 */
export interface ContractValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ContractValidationErrorDetail[];
  readonly validatedAt: Timestamp;
  readonly schemaVersion: string;
}

/**
 * Execution proof entry - records what the planner actually did.
 */
export interface ExecutionProofEntry {
  readonly stage: string;
  readonly operation: string;
  readonly timestamp: Timestamp;
  readonly inputHash: SHA256Hash;
  readonly outputHash: SHA256Hash;
  readonly durationMs: number;
  readonly decision: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Execution proof - cryptographic evidence of planning operations.
 * Required in ALL planning responses, even planning-only ones.
 */
export interface ExecutionProof {
  readonly proofId: UUID;
  readonly sessionId: UUID;
  readonly requestHash: SHA256Hash;
  readonly responseHash: SHA256Hash;
  readonly entries: readonly ExecutionProofEntry[];
  readonly totalDurationMs: number;
  readonly stageCount: number;
  readonly createdAt: Timestamp;
  readonly plannerVersion: string;
  readonly contractVersion: string;
}

/**
 * Planning response with execution proof.
 */
export interface ContractPlanningResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ContractValidationErrorDetail[];
  };
  readonly executionProof: ExecutionProof;
  readonly validationResult: ContractValidationResult;
}

/**
 * Contract schema metadata.
 */
export interface ContractSchemaMetadata {
  readonly schemaId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Execution metadata required at the root of all HTTP responses.
 * This is the canonical format expected by the agentics CLI.
 */
export interface ExecutionMetadata {
  readonly request_id: UUID;
  readonly timestamp: Timestamp;
  readonly service: 'agentics-simulation-planner';
  readonly version: string;
  readonly processing_time_ms: number;
  readonly status: 'success' | 'error';
}
