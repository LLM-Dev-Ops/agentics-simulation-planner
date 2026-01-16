/**
 * Executive-Synthesis Response Builder
 *
 * Generates synthesis-compatible fields for plan responses.
 * These fields enable plan output to be consumed by executive-synthesis unchanged.
 */

import type { UUID, Timestamp, SHA256Hash } from '../types/common.js';
import type { SimulationPlan } from '../types/simulation-plan.js';
import type {
  ExecutionProof,
  ExecutiveSynthesisFields,
  PlanCategory,
  SynthesisStepExecution,
  SynthesisPlanStatus,
  ContractScenarioDefinition,
} from './types.js';
import { generateDeterministicId, hashSHA256 } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';

/** Enterprise keywords for category inference */
const ENTERPRISE_KEYWORDS = [
  'enterprise',
  'erp',
  'sap',
  'oracle',
  'workday',
  'dynamics',
  'salesforce',
  'crm',
  'global',
  'multi-region',
  'multi-subsidiary',
  'corporate',
  'large-scale',
  'transformation',
  'digital transformation',
];

/** Integration keywords for category inference */
const INTEGRATION_KEYWORDS = [
  'integration',
  'api',
  'connect',
  'sync',
  'data flow',
  'pipeline',
  'middleware',
  'adapter',
  'webhook',
  'etl',
  'data exchange',
  'interoperability',
];

/**
 * Infers plan category from intent and plan content.
 * @param intent - The natural language intent
 * @param plan - The generated simulation plan
 * @returns Inferred category
 */
export function inferPlanCategory(
  intent: string,
  plan: SimulationPlan
): PlanCategory {
  const lowerIntent = intent.toLowerCase();

  // Check for enterprise keywords in intent
  const hasEnterpriseKeywords = ENTERPRISE_KEYWORDS.some(
    keyword => lowerIntent.includes(keyword)
  );

  // Check for integration keywords in intent
  const hasIntegrationKeywords = INTEGRATION_KEYWORDS.some(
    keyword => lowerIntent.includes(keyword)
  );

  // Check plan characteristics for enterprise indicators
  const hasERPSurfaces = (plan.erpSurfaces?.length ?? 0) > 0;
  const hasERPRequirements = (plan.erpRequirements?.length ?? 0) > 0;
  const hasMultipleIntegrations = (plan.integrations?.length ?? 0) > 2;
  const hasComplexWorkflows = (plan.workflows?.length ?? 0) > 3;
  const hasMultipleAgents = (plan.agents?.length ?? 0) > 5;

  // Enterprise: ERP surfaces OR enterprise keywords with complexity
  if (hasERPSurfaces || hasERPRequirements) {
    return 'enterprise';
  }

  if (hasEnterpriseKeywords && (hasComplexWorkflows || hasMultipleAgents)) {
    return 'enterprise';
  }

  // Integration: integration keywords OR multiple integrations
  if (hasIntegrationKeywords || hasMultipleIntegrations) {
    return 'integration';
  }

  // Default: standard
  return 'standard';
}

/**
 * Calculates complexity score (0-1) from plan characteristics.
 * @param plan - The simulation plan
 * @returns Complexity score between 0 and 1
 */
export function calculateComplexityScore(plan: SimulationPlan): number {
  // Base factors with weights
  const factors = [
    { value: Math.min((plan.agents?.length ?? 0) / 20, 1), weight: 0.2 },
    { value: Math.min((plan.workflows?.length ?? 0) / 10, 1), weight: 0.2 },
    { value: Math.min((plan.integrations?.length ?? 0) / 10, 1), weight: 0.15 },
    { value: Math.min((plan.objectives?.length ?? 0) / 10, 1), weight: 0.15 },
    { value: Math.min((plan.erpSurfaces?.length ?? 0) / 5, 1), weight: 0.1 },
    { value: Math.min((plan.execution?.phases?.length ?? 0) / 5, 1), weight: 0.1 },
    { value: plan.scopeValidation?.estimatedComplexity === 'VERY_HIGH' ? 1 :
             plan.scopeValidation?.estimatedComplexity === 'HIGH' ? 0.8 :
             plan.scopeValidation?.estimatedComplexity === 'MEDIUM' ? 0.5 : 0.3,
      weight: 0.1 },
  ];

  const score = factors.reduce(
    (acc, factor) => acc + factor.value * factor.weight,
    0
  );

  // Clamp to 0-1 range with 2 decimal precision
  return Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;
}

/**
 * Estimates plan execution duration in milliseconds.
 * @param plan - The simulation plan
 * @returns Estimated duration in milliseconds
 */
export function estimatePlanDuration(plan: SimulationPlan): number {
  // Use resource requirements if available
  if (plan.resourceRequirements?.estimatedDuration) {
    return plan.resourceRequirements.estimatedDuration;
  }

  // Estimate based on plan complexity
  const baseTimePerAgent = 5000; // 5 seconds per agent
  const baseTimePerWorkflow = 10000; // 10 seconds per workflow
  const baseTimePerPhase = 15000; // 15 seconds per phase

  const agentTime = (plan.agents?.length ?? 0) * baseTimePerAgent;
  const workflowTime = (plan.workflows?.length ?? 0) * baseTimePerWorkflow;
  const phaseTime = (plan.execution?.phases?.length ?? 0) * baseTimePerPhase;

  return Math.max(agentTime + workflowTime + phaseTime, 30000); // Minimum 30 seconds
}

/**
 * Counts total planned steps from workflows.
 * @param plan - The simulation plan
 * @returns Total number of planned steps
 */
export function countPlannedSteps(plan: SimulationPlan): number {
  if (!plan.workflows) {
    return plan.execution?.phases?.length ?? 1;
  }

  return plan.workflows.reduce(
    (total, workflow) => total + (workflow.steps?.length ?? 0),
    0
  ) || (plan.execution?.phases?.length ?? 1);
}

/**
 * Converts execution proof entries to synthesis step executions.
 * @param proof - The execution proof
 * @returns Array of synthesis step executions
 */
export function convertProofToSteps(
  proof: ExecutionProof
): readonly SynthesisStepExecution[] {
  return proof.entries.map(entry => ({
    stepId: entry.stage.toLowerCase().replace(/_/g, '-'),
    action: entry.operation.toLowerCase().replace(/_/g, '-'),
    status: entry.decision === 'FAILED' ? 'failed' as const : 'success' as const,
    duration_ms: entry.durationMs,
  }));
}

/**
 * Input for building synthesis fields.
 */
export interface SynthesisBuilderInput {
  readonly plan: SimulationPlan;
  readonly sessionId: UUID;
  readonly contentHash: SHA256Hash;
  readonly processingTimeMs: number;
  readonly executionProof: ExecutionProof;
  readonly intent: string;
  readonly scenario?: ContractScenarioDefinition;
  readonly namespace?: string;
}

/**
 * Builds executive-synthesis compatible fields from plan result.
 * @param input - The builder input containing plan and metadata
 * @returns ExecutiveSynthesisFields for the response
 */
export function buildSynthesisFields(
  input: SynthesisBuilderInput
): ExecutiveSynthesisFields {
  const {
    plan,
    sessionId,
    contentHash,
    processingTimeMs,
    executionProof,
    intent,
    scenario,
    namespace,
  } = input;

  const timestamp = getCurrentTimestampUTC();
  const category = inferPlanCategory(intent, plan);
  const complexityScore = calculateComplexityScore(plan);
  const estimatedDuration = estimatePlanDuration(plan);
  const stepsPlanned = countPlannedSteps(plan);
  const stepsExecuted = convertProofToSteps(executionProof);

  // Determine if all steps succeeded
  const allStepsSucceeded = stepsExecuted.every(step => step.status === 'success');
  const status: SynthesisPlanStatus = allStepsSucceeded ? 'validated' : 'failed';

  return {
    id: `plan-${plan.metadata.planId}`,
    type: 'PlanReference',
    repository: namespace ?? 'default',
    status,
    created_at: plan.metadata.createdAt,
    completed_at: timestamp,
    iteration_count: 1,
    results: {
      total_iterations: 1,
      successful_iterations: allStepsSucceeded ? 1 : 0,
      failed_iterations: allStepsSucceeded ? 0 : 1,
      success_rate: allStepsSucceeded ? 1.0 : 0.0,
      metrics: {
        steps_planned: stepsPlanned,
        estimated_duration_ms: estimatedDuration,
        complexity_score: complexityScore,
      },
    },
    scenario: {
      scenarioId: scenario?.scenarioId ?? plan.metadata.planId,
      name: scenario?.name ?? extractPlanName(intent),
      description: scenario?.description ?? intent,
      category,
      version: scenario ? '1.0' : plan.version,
    },
    steps_executed: stepsExecuted,
    synthesis_execution_metadata: {
      execution_id: sessionId,
      layer: 'planning',
      timestamp,
      trace_id: plan.metadata.traceId,
      checksum: contentHash,
    },
  };
}

/**
 * Extracts a short plan name from intent.
 * @param intent - The full intent string
 * @returns Shortened plan name
 */
function extractPlanName(intent: string): string {
  // Take first 50 chars and find a natural break
  const maxLength = 50;
  if (intent.length <= maxLength) {
    return intent;
  }

  const truncated = intent.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > 20
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...';
}

/**
 * Builds synthesis fields for a failed plan.
 * @param error - The error that occurred
 * @param sessionId - Session ID
 * @param intent - Original intent
 * @param processingTimeMs - Processing time in ms
 * @param namespace - Optional namespace
 * @returns ExecutiveSynthesisFields for error response
 */
export function buildFailedSynthesisFields(
  error: Error,
  sessionId: UUID,
  intent: string,
  processingTimeMs: number,
  namespace?: string
): ExecutiveSynthesisFields {
  const timestamp = getCurrentTimestampUTC();
  const planId = generateDeterministicId('plan', sessionId, 'failed');
  const checksum = hashSHA256(JSON.stringify({ error: error.message, sessionId }));

  return {
    id: `plan-${planId}`,
    type: 'PlanReference',
    repository: namespace ?? 'default',
    status: 'failed',
    created_at: timestamp,
    completed_at: timestamp,
    iteration_count: 1,
    results: {
      total_iterations: 1,
      successful_iterations: 0,
      failed_iterations: 1,
      success_rate: 0.0,
      metrics: {
        steps_planned: 0,
        estimated_duration_ms: 0,
        complexity_score: 0,
      },
    },
    scenario: {
      scenarioId: planId,
      name: extractPlanName(intent),
      description: intent,
      category: 'standard',
      version: '1.0',
    },
    steps_executed: [
      {
        stepId: 'validation',
        action: 'validate-request',
        status: 'failed',
        duration_ms: processingTimeMs,
      },
    ],
    synthesis_execution_metadata: {
      execution_id: sessionId,
      layer: 'planning',
      timestamp,
      trace_id: planId,
      checksum,
    },
  };
}
