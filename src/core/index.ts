/**
 * Core module index
 * Re-exports the main planner functionality.
 */

export {
  planSimulation,
  verifyDeterminism,
  createMinimalContext,
  type PlanningInput,
  type PlanningResult,
  type PlanningOptions,
} from './planner.js';

// SimulationPlanBuilder for explicit plan construction
export {
  SimulationPlanBuilder,
  createSimulationPlanBuilder,
  extendSimulationPlan,
  type SimulationPlanBuilderOptions,
  type SimulationPlanBuildResult,
} from './simulation-plan-builder.js';
