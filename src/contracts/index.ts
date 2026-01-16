/**
 * @agentics/contracts - Contract Enforcement Module
 *
 * This module provides strict contract enforcement for simulation planning requests.
 * ALL requests MUST be validated through this module before any planning operations.
 *
 * Key principles:
 * 1. Validation occurs BEFORE any planning, graph construction, or scenario derivation
 * 2. Invalid requests fail immediately with detailed error information
 * 3. All responses include execution proof - even planning-only or error responses
 * 4. No local schema assumptions, inferred defaults, or permissive paths
 */

// Types
export type {
  ContractTargetEngine,
  ContractTimeHorizon,
  ContractDataVolume,
  ContractScopeConfig,
  ContractTemporalConstraints,
  ContractResourceConstraints,
  ContractConstraintsConfig,
  ContractPoliciesConfig,
  ContractSimulationConfig,
  ContractScenarioAssumption,
  ContractScenarioDefinition,
  ValidatedPlanningRequest,
  ContractValidationErrorDetail,
  ContractValidationResult,
  ExecutionProofEntry,
  ExecutionProof,
  ContractPlanningResponse,
  ContractSchemaMetadata,
  ExecutionMetadata,
  // Executive-Synthesis Types
  PlanCategory,
  StepStatus,
  SynthesisStepExecution,
  SynthesisPlanningMetrics,
  SynthesisResults,
  SynthesisScenario,
  SynthesisExecutionMetadata,
  SynthesisPlanStatus,
  ExecutiveSynthesisFields,
} from './types.js';

// Validator
export {
  CONTRACT_VERSION,
  SCHEMA_VERSION,
  ContractValidationError,
  validatePlanningRequest,
  parseAndValidateRequest,
} from './validator.js';

// Execution Proof
export {
  ExecutionProofBuilder,
  createExecutionProofFromAuditTrail,
  createValidationFailureProof,
  verifyExecutionProof,
} from './execution-proof.js';

// Executive-Synthesis Builder
export {
  inferPlanCategory,
  calculateComplexityScore,
  estimatePlanDuration,
  countPlannedSteps,
  convertProofToSteps,
  buildSynthesisFields,
  buildFailedSynthesisFields,
  type SynthesisBuilderInput,
} from './synthesis-builder.js';
