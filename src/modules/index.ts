/**
 * Modules index
 * Re-exports all pipeline stage modules.
 */

export { ingestIntent, type IntentIngestionInput } from './intent-ingestion.js';
export { decomposeIntent } from './intent-decomposition.js';
export { extractTopology } from './topology-extraction.js';
export { expandAgentsAndWorkflows } from './agent-workflow-expansion.js';
export {
  discoverIntegrations,
  getAvailableERPSurfaces,
  getERPSurfaceByDomain,
  detectsERPCapability,
} from './integration-discovery.js';
export { resolveConstraints } from './constraint-resolution.js';
export { validateAndNormalize } from './validation-normalization.js';
export { serializeSimulationPlan } from './simulation-plan-serialization.js';
