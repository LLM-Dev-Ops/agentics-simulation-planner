/**
 * Common type definitions for the Agentics Simulation Planner
 * These types are used across all modules and ensure deterministic operations.
 */

/** Unique identifier type using UUID v4 format */
export type UUID = string;

/** ISO 8601 timestamp string */
export type Timestamp = string;

/** SHA-256 hash string (64 hex characters) */
export type SHA256Hash = string;

/** Error severity levels for the planning pipeline */
export type ErrorSeverity = 'FATAL' | 'ERROR' | 'WARNING' | 'INFO';

/** Isolation levels for ruvvector transactions */
export type IsolationLevel = 'SERIALIZABLE' | 'REPEATABLE_READ' | 'READ_COMMITTED';

/** Pipeline stage identifiers */
export type PipelineStage =
  | 'INTENT_INGESTION'
  | 'INTENT_DECOMPOSITION'
  | 'TOPOLOGY_EXTRACTION'
  | 'AGENT_WORKFLOW_EXPANSION'
  | 'INTEGRATION_DISCOVERY'
  | 'CONSTRAINT_RESOLUTION'
  | 'VALIDATION_NORMALIZATION'
  | 'SERIALIZATION';

/** Constraint types that can be applied to objectives */
export type ConstraintType =
  | 'TEMPORAL'
  | 'RESOURCE'
  | 'DEPENDENCY'
  | 'AUTHORIZATION'
  | 'SLA'
  | 'PRECONDITION'
  | 'POSTCONDITION'
  | 'REQUIRES';

/** Priority levels for constraints and objectives */
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Objective types as defined in the SimulationPlan schema */
export type ObjectiveType =
  | 'cost_reduction'
  | 'capacity_scaling'
  | 'performance_improvement'
  | 'risk_mitigation'
  | 'resource_optimization';

/** Execution strategy types */
export type ExecutionStrategy = 'sequential' | 'parallel' | 'hybrid';

/** Action complexity levels */
export type ActionComplexity = 'SIMPLE' | 'COMPOUND' | 'HIERARCHICAL';

/** Token types for intent parsing */
export type TokenType =
  | 'SENTENCE_BOUNDARY'
  | 'CLAUSE'
  | 'ENTITY'
  | 'QUANTIFIER'
  | 'TEMPORAL'
  | 'ACTION'
  | 'WORD';

/** Entity classification types */
export type EntityType =
  | 'DIVISION'
  | 'TEAM'
  | 'ROLE'
  | 'PRODUCT'
  | 'REGION'
  | 'SYSTEM'
  | 'PROCESS'
  | 'RESOURCE';

/** Team types for organizational topology */
export type TeamType =
  | 'ENGINEERING'
  | 'OPERATIONS'
  | 'SALES'
  | 'MARKETING'
  | 'SUPPORT'
  | 'MANAGEMENT'
  | 'RESEARCH'
  | 'CROSS_FUNCTIONAL';

/** Communication protocols between agents */
export type CommunicationProtocol = 'SYNC' | 'ASYNC' | 'EVENT' | 'STREAM';

/** Communication direction */
export type CommunicationDirection = 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL';

/** Match status for capability matching */
export type MatchStatus = 'MATCHED' | 'UNMATCHED' | 'PARTIAL';

/** Constraint resolution strategies */
export type ResolutionStrategy = 'PRIORITY' | 'SOURCE_AUTHORITY' | 'CONSERVATIVE';

/** Validation status */
export type ValidationStatus = 'PENDING' | 'VALID' | 'INVALID';

/** Repository availability status */
export type RepositoryStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

/** Execution node types in the execution graph */
export type ExecutionNodeType = 'STEP' | 'CHECKPOINT' | 'DECISION' | 'MERGE';

/** Execution edge types */
export type ExecutionEdgeType = 'DATA_DEPENDENCY' | 'AGENT_DEPENDENCY' | 'CONTROL_FLOW';

/** Parallelization strategies for workflows */
export type ParallelizationStrategy = 'NONE' | 'STEP_LEVEL' | 'WORKFLOW_LEVEL' | 'ADAPTIVE';
