/**
 * Agentics Simulation Planner
 *
 * Translates natural language organizational goals into deterministic,
 * machine-readable SimulationPlan outputs using ruvvector as the
 * mandatory state, memory, and relational reasoning substrate.
 *
 * IMPORTANT: All requests are validated against @agentics/contracts
 * at the entry point. See ./contracts for the request schema.
 *
 * @module agentics-simulation-planner
 */

// Core planner exports
export {
  planSimulation,
  planSimulationWithContract,
  verifyDeterminism,
  createMinimalContext,
  type PlanningInput,
  type PlanningResult,
  type PlanningOptions,
  type ContractPlanningInput,
  type ContractPlanningResult,
  // SimulationPlanBuilder for explicit plan construction
  SimulationPlanBuilder,
  createSimulationPlanBuilder,
  extendSimulationPlan,
  type SimulationPlanBuilderOptions,
  type SimulationPlanBuildResult,
} from './core/index.js';

// Contract exports - MUST be used for request validation
export {
  // Types
  type ContractTargetEngine,
  type ContractTimeHorizon,
  type ContractDataVolume,
  type ContractScopeConfig,
  type ContractTemporalConstraints,
  type ContractResourceConstraints,
  type ContractConstraintsConfig,
  type ContractPoliciesConfig,
  type ContractSimulationConfig,
  type ContractScenarioAssumption,
  type ContractScenarioDefinition,
  type ValidatedPlanningRequest,
  type ContractValidationErrorDetail,
  type ContractValidationResult,
  type ExecutionProofEntry,
  type ExecutionProof,
  type ContractPlanningResponse,
  type ContractSchemaMetadata,
  // Validator
  CONTRACT_VERSION,
  SCHEMA_VERSION,
  ContractValidationError,
  validatePlanningRequest,
  parseAndValidateRequest,
  // Execution Proof
  ExecutionProofBuilder,
  createExecutionProofFromAuditTrail,
  createValidationFailureProof,
  verifyExecutionProof,
} from './contracts/index.js';

// Type exports
export * from './types/index.js';

// Adapter exports
export { getRuvvectorAdapter, resetRuvvectorAdapter, InMemoryRuvvectorAdapter } from './adapters/index.js';

// Utility exports
export { hashSHA256, generateDeterministicId, serializeCanonical, verifyHash } from './utils/crypto.js';
export { normalizeText, getCurrentTimestampUTC, stableSort } from './utils/text.js';

// Module exports (for advanced usage)
export {
  ingestIntent,
  decomposeIntent,
  extractTopology,
  expandAgentsAndWorkflows,
  discoverIntegrations,
  resolveConstraints,
  validateAndNormalize,
  serializeSimulationPlan,
} from './modules/index.js';

// Executive Synthesis exports - Decision Packet generation
// Use for: plan create, plan approve
// Exclude for: plan list, plan inspect, plan delete
export {
  // Builder functions
  buildExecutiveSummary,
  elevateRiskForProduction,
  // Utility functions
  determineEnvironment,
  calculateSuccessRate,
  countBlockingIssues,
  extractBlockingIssues,
  isProductionTarget,
  createDecisionContext,
  createDecisionMetrics,
  // Constants
  DEFAULT_PRODUCTION_ELEVATION,
  // Types
  type Environment,
  type RiskSeverity,
  type RiskCategory,
  type IdentifiedRisk,
  type Mitigation,
  type BlockingIssue,
  type SynthesisPhase,
  type DecisionPacketContext,
  type DecisionPacketMetrics,
  type DecisionPacket,
  type ExecutiveSummaryInput,
  type ExecutiveSummaryResult,
  type RiskElevationConfig,
} from './synthesis/index.js';
