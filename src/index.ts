/**
 * Agentics Simulation Planner
 *
 * Translates natural language organizational goals into deterministic,
 * machine-readable SimulationPlan outputs using ruvvector as the
 * mandatory state, memory, and relational reasoning substrate.
 *
 * @module agentics-simulation-planner
 */

// Core planner exports
export {
  planSimulation,
  verifyDeterminism,
  createMinimalContext,
  type PlanningInput,
  type PlanningResult,
  type PlanningOptions,
  // SimulationPlanBuilder for explicit plan construction
  SimulationPlanBuilder,
  createSimulationPlanBuilder,
  extendSimulationPlan,
  type SimulationPlanBuilderOptions,
  type SimulationPlanBuildResult,
} from './core/index.js';

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
