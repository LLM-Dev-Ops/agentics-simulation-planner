/**
 * Validation and normalization type definitions
 * Defines structures for schema validation and semantic consistency checks.
 */

import type { UUID, Timestamp, ValidationStatus } from './common.js';
import type { AgentSpecification, WorkflowDefinition, InterAgentDependency } from './agent.js';

/** Schema validation error */
export interface SchemaError {
  readonly entity: 'Agent' | 'Workflow' | 'Constraint' | 'Plan';
  readonly entityId: UUID;
  readonly path: string;
  readonly message: string;
}

/** Schema validation result */
export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly errors: readonly SchemaError[];
  readonly warnings: readonly SchemaError[];
}

/** Semantic issue */
export interface SemanticIssue {
  readonly type: 'INVALID_REFERENCE' | 'ORPHAN_CONSTRAINT' | 'DUPLICATE_ID';
  readonly location: string;
  readonly message: string;
}

/** Semantic validation result */
export interface SemanticValidationResult {
  readonly consistent: boolean;
  readonly issues: readonly SemanticIssue[];
}

/** Normalized data structures */
export interface NormalizedDataStructures {
  readonly agents: readonly AgentSpecification[];
  readonly workflows: readonly WorkflowDefinition[];
  readonly dependencies: readonly InterAgentDependency[];
}

/** Validation report */
export interface ValidationReport {
  readonly schemaValidation: SchemaValidationResult;
  readonly semanticValidation: SemanticValidationResult;
  readonly normalizationApplied: boolean;
  readonly timestamp: Timestamp;
  readonly validatorVersion: string;
}

/** Normalized plan */
export interface NormalizedPlan {
  readonly id: UUID;
  readonly constraintsId: UUID;
  readonly expandedId: UUID;
  readonly schemaValidation: SchemaValidationResult;
  readonly semanticValidation: SemanticValidationResult;
  readonly normalizedStructures: NormalizedDataStructures;
  readonly validationReport: ValidationReport;
  readonly validationStatus: 'PENDING' | 'VALID' | 'INVALID';
  readonly timestamp: Timestamp;
}
