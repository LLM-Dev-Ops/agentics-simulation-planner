/**
 * Executive Synthesis Module
 *
 * Generates decision packets for plan operations that require synthesis.
 *
 * Applicable commands:
 * - plan create: commits a declarative state change to the planning domain
 * - plan approve: formally accepts risk and authorizes downstream execution
 *
 * Explicit exclusions (no synthesis):
 * - plan list: read-only enumeration
 * - plan inspect: read-only detail retrieval
 * - plan delete: destructive but non-generative; no decision packet required
 */

import type { UUID, SHA256Hash } from '../types/common.js';
import type { SynthesisResults, SynthesisPlanStatus } from '../contracts/types.js';
import { generateDeterministicId, hashSHA256, serializeCanonical } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';
import type {
  Environment,
  RiskSeverity,
  RiskCategory,
  IdentifiedRisk,
  Mitigation,
  BlockingIssue,
  SynthesisPhase,
  DecisionPacketContext,
  DecisionPacketMetrics,
  DecisionPacket,
  ExecutiveSummaryInput,
  ExecutiveSummaryResult,
  RiskElevationConfig,
} from './types.js';

// Re-export types for convenience
export type {
  Environment,
  RiskSeverity,
  RiskCategory,
  IdentifiedRisk,
  Mitigation,
  BlockingIssue,
  SynthesisPhase,
  DecisionPacketContext,
  DecisionPacketMetrics,
  DecisionPacket,
  ExecutiveSummaryInput,
  ExecutiveSummaryResult,
  RiskElevationConfig,
} from './types.js';

export { DEFAULT_PRODUCTION_ELEVATION } from './types.js';

/**
 * Severity weights for confidence calculation.
 */
const SEVERITY_WEIGHTS: Record<RiskSeverity, number> = {
  low: 0.05,
  medium: 0.15,
  high: 0.30,
  critical: 0.50,
};

/**
 * Risk category to severity mapping for initial assessment.
 */
const CATEGORY_SEVERITY_MAP: Record<RiskCategory, RiskSeverity> = {
  scope_creep: 'medium',
  constraint_violation: 'high',
  dependency_conflict: 'high',
  invalid_reference: 'critical',
  circular_dependency: 'critical',
  resource_exhaustion: 'high',
  validation_failure: 'medium',
  execution_failure: 'high',
};

/**
 * Determines the environment from input context.
 * @param input - Any input object that may contain environment hints
 * @returns Detected environment
 */
export function determineEnvironment(
  input: Record<string, unknown>
): Environment {
  // Check explicit environment field
  if (typeof input['environment'] === 'string') {
    const env = input['environment'].toLowerCase();
    if (env === 'production' || env === 'prod') return 'production';
    if (env === 'staging' || env === 'stage') return 'staging';
    return 'development';
  }

  // Check namespace for environment hints
  if (typeof input['namespace'] === 'string') {
    const ns = input['namespace'].toLowerCase();
    if (ns.includes('prod')) return 'production';
    if (ns.includes('stag')) return 'staging';
  }

  // Check config for production indicators
  if (input['config'] && typeof input['config'] === 'object') {
    const config = input['config'] as Record<string, unknown>;
    if (config['policies'] && typeof config['policies'] === 'object') {
      const policies = config['policies'] as Record<string, unknown>;
      if (policies['executionMode'] === 'strict') return 'production';
    }
  }

  // Default to development
  return 'development';
}

/**
 * Calculates success rate from metrics.
 * @param result - Result object with iteration data
 * @returns Success rate (0.0 - 1.0)
 */
export function calculateSuccessRate(
  result: { success?: boolean; results?: SynthesisResults }
): number {
  if (result.results) {
    return result.results.success_rate;
  }
  return result.success ? 1.0 : 0.0;
}

/**
 * Counts blocking issues from result.
 * @param result - Result object that may contain errors
 * @returns Number of blocking issues
 */
export function countBlockingIssues(
  result: { error?: { details?: unknown[] }; validationResult?: { errors?: unknown[] } }
): number {
  let count = 0;
  if (result.error?.details && Array.isArray(result.error.details)) {
    count += result.error.details.length;
  }
  if (result.validationResult?.errors && Array.isArray(result.validationResult.errors)) {
    count += result.validationResult.errors.length;
  }
  return count;
}

/**
 * Extracts blocking issues from result.
 * @param result - Result object that may contain errors
 * @returns Array of blocking issues
 */
export function extractBlockingIssues(
  result: {
    error?: { details?: Array<{ path?: string; message?: string }> };
    validationResult?: { errors?: Array<{ path?: string; message?: string }> };
  }
): readonly BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  if (result.error?.details && Array.isArray(result.error.details)) {
    for (const detail of result.error.details) {
      issues.push({
        id: generateDeterministicId('issue', detail.path ?? 'unknown', detail.message ?? ''),
        category: 'validation_failure',
        description: detail.message ?? 'Unknown error',
        path: detail.path,
      });
    }
  }

  if (result.validationResult?.errors && Array.isArray(result.validationResult.errors)) {
    for (const error of result.validationResult.errors) {
      // Skip duplicates
      if (issues.some(i => i.path === error.path && i.description === error.message)) {
        continue;
      }
      issues.push({
        id: generateDeterministicId('issue', error.path ?? 'unknown', error.message ?? ''),
        category: 'validation_failure',
        description: error.message ?? 'Validation error',
        path: error.path,
      });
    }
  }

  return issues;
}

/**
 * Determines if the target is production.
 * @param input - Input object to analyze
 * @returns True if production target
 */
export function isProductionTarget(input: Record<string, unknown>): boolean {
  return determineEnvironment(input) === 'production';
}

/**
 * Generates identified risks from blocking issues.
 * @param issues - Blocking issues to analyze
 * @returns Array of identified risks
 */
function generateRisksFromIssues(
  issues: readonly BlockingIssue[]
): readonly IdentifiedRisk[] {
  const timestamp = getCurrentTimestampUTC();

  return issues.map(issue => ({
    id: generateDeterministicId('risk', issue.id),
    category: issue.category,
    severity: CATEGORY_SEVERITY_MAP[issue.category],
    description: issue.description,
    affectedComponents: issue.path ? [issue.path] : [],
    detectedAt: timestamp,
  }));
}

/**
 * Generates mitigations for identified risks.
 * @param risks - Risks to mitigate
 * @returns Array of recommended mitigations
 */
function generateMitigations(
  risks: readonly IdentifiedRisk[]
): readonly Mitigation[] {
  return risks.map(risk => {
    const mitigation: Mitigation = {
      riskId: risk.id,
      action: getMitigationAction(risk.category),
      priority: getMitigationPriority(risk.severity),
      estimatedEffort: getMitigationEffort(risk.category),
      automated: isMitigationAutomatable(risk.category),
    };
    return mitigation;
  });
}

/**
 * Gets mitigation action based on risk category.
 */
function getMitigationAction(category: RiskCategory): string {
  const actions: Record<RiskCategory, string> = {
    scope_creep: 'Review and constrain scope boundaries',
    constraint_violation: 'Adjust constraints or modify plan to comply',
    dependency_conflict: 'Resolve dependency version conflicts',
    invalid_reference: 'Fix or remove invalid references',
    circular_dependency: 'Break circular dependency chain',
    resource_exhaustion: 'Reduce resource requirements or increase limits',
    validation_failure: 'Fix validation errors in input',
    execution_failure: 'Debug and fix execution issues',
  };
  return actions[category];
}

/**
 * Gets mitigation priority based on severity.
 */
function getMitigationPriority(
  severity: RiskSeverity
): 'immediate' | 'short_term' | 'long_term' {
  if (severity === 'critical') return 'immediate';
  if (severity === 'high') return 'immediate';
  if (severity === 'medium') return 'short_term';
  return 'long_term';
}

/**
 * Gets mitigation effort based on category.
 */
function getMitigationEffort(
  category: RiskCategory
): 'trivial' | 'minor' | 'moderate' | 'significant' | 'major' {
  const efforts: Record<RiskCategory, 'trivial' | 'minor' | 'moderate' | 'significant' | 'major'> = {
    scope_creep: 'moderate',
    constraint_violation: 'minor',
    dependency_conflict: 'moderate',
    invalid_reference: 'trivial',
    circular_dependency: 'significant',
    resource_exhaustion: 'moderate',
    validation_failure: 'minor',
    execution_failure: 'moderate',
  };
  return efforts[category];
}

/**
 * Determines if mitigation can be automated.
 */
function isMitigationAutomatable(category: RiskCategory): boolean {
  const automatable: Record<RiskCategory, boolean> = {
    scope_creep: false,
    constraint_violation: true,
    dependency_conflict: true,
    invalid_reference: true,
    circular_dependency: false,
    resource_exhaustion: true,
    validation_failure: false,
    execution_failure: false,
  };
  return automatable[category];
}

/**
 * Calculates approval confidence score.
 * @param metrics - Decision metrics
 * @param risks - Identified risks
 * @returns Confidence score (0.0 - 1.0)
 */
function calculateApprovalConfidence(
  metrics: DecisionPacketMetrics,
  risks: readonly IdentifiedRisk[]
): number {
  // Start with success rate as base
  let confidence = metrics.success_rate;

  // Reduce for each risk based on severity
  for (const risk of risks) {
    confidence -= SEVERITY_WEIGHTS[risk.severity];
  }

  // Reduce for blocking issues
  confidence -= metrics.blocking_issues.length * 0.1;

  // Clamp to valid range
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

/**
 * Determines plan status from metrics.
 */
function determinePlanStatus(
  metrics: DecisionPacketMetrics
): SynthesisPlanStatus {
  if (metrics.blocking_issues.length > 0) {
    return 'failed';
  }
  if (metrics.success_rate >= 1.0) {
    return 'validated';
  }
  return 'created';
}

/**
 * Generates human-readable summary.
 */
function generateSummary(
  status: SynthesisPlanStatus,
  confidence: number,
  risks: readonly IdentifiedRisk[],
  metrics: DecisionPacketMetrics
): string {
  const parts: string[] = [];

  if (status === 'validated') {
    parts.push('Plan validated successfully.');
  } else if (status === 'failed') {
    parts.push(`Plan failed with ${metrics.blocking_issues.length} blocking issue(s).`);
  } else {
    parts.push('Plan created and pending validation.');
  }

  parts.push(`Approval confidence: ${(confidence * 100).toFixed(0)}%.`);

  if (risks.length > 0) {
    const critical = risks.filter(r => r.severity === 'critical').length;
    const high = risks.filter(r => r.severity === 'high').length;
    if (critical > 0) {
      parts.push(`${critical} critical risk(s) identified.`);
    }
    if (high > 0) {
      parts.push(`${high} high-severity risk(s) identified.`);
    }
  } else {
    parts.push('No significant risks identified.');
  }

  return parts.join(' ');
}

/**
 * Builds an executive summary / decision packet.
 *
 * This function generates the decision packet that must be emitted
 * before any plan transitions to approved state.
 *
 * @param context - Context information (environment, timestamp, version, commit_sha)
 * @param metrics - Metrics from the operation
 * @param phases - Phases that were completed
 * @returns Executive summary result with decision packet
 */
export function buildExecutiveSummary(
  context: DecisionPacketContext,
  metrics: DecisionPacketMetrics,
  phases: readonly SynthesisPhase[]
): ExecutiveSummaryResult {
  const packetId = generateDeterministicId(
    'decision',
    context.timestamp,
    context.version
  );

  // Generate risks from blocking issues
  const risks = generateRisksFromIssues(metrics.blocking_issues);

  // Generate mitigations for risks
  const mitigations = generateMitigations(risks);

  // Calculate approval confidence
  const confidence = calculateApprovalConfidence(metrics, risks);

  // Determine status
  const status = determinePlanStatus(metrics);

  // Build synthesis results for compatibility
  const results: SynthesisResults = {
    total_iterations: 1,
    successful_iterations: metrics.success_rate >= 1.0 ? 1 : 0,
    failed_iterations: metrics.failed_iterations,
    success_rate: metrics.success_rate,
    metrics: {
      steps_planned: phases.length,
      estimated_duration_ms: phases.length * 5000, // 5s per phase estimate
      complexity_score: risks.length > 0 ? Math.min(risks.length * 0.2, 1.0) : 0.1,
    },
  };

  // Generate checksum
  const checksum = hashSHA256(
    serializeCanonical({
      packetId,
      context,
      status,
      confidence,
      risks,
      mitigations,
    })
  );

  // Generate summary
  const summary = generateSummary(status, confidence, risks, metrics);

  const packet: DecisionPacket = {
    packet_id: packetId,
    type: 'DecisionPacket',
    context,
    status,
    approval_confidence: confidence,
    phases_completed: phases,
    risks,
    mitigations,
    metrics,
    results,
    checksum,
    production_elevated: false,
    summary,
  };

  // Determine recommendation
  const recommended = confidence >= 0.7 && status !== 'failed';
  const reasons: string[] = [];

  if (recommended) {
    reasons.push('Approval confidence meets threshold (≥70%)');
    if (risks.length === 0) {
      reasons.push('No significant risks identified');
    }
  } else {
    if (confidence < 0.7) {
      reasons.push(`Approval confidence below threshold (${(confidence * 100).toFixed(0)}% < 70%)`);
    }
    if (status === 'failed') {
      reasons.push('Plan has blocking issues');
    }
    if (risks.some(r => r.severity === 'critical')) {
      reasons.push('Critical risks require resolution');
    }
  }

  return {
    packet,
    recommended,
    reasons,
  };
}

/**
 * Elevates risk assessment for production targets.
 *
 * When a plan targets production, this function applies additional
 * scrutiny by reducing confidence and escalating severity levels.
 *
 * @param summary - The executive summary to elevate
 * @param config - Optional elevation configuration
 * @returns Elevated executive summary (mutates input)
 */
export function elevateRiskForProduction(
  summary: ExecutiveSummaryResult,
  config?: Partial<RiskElevationConfig>
): ExecutiveSummaryResult {
  const finalConfig: RiskElevationConfig = {
    confidencePenalty: config?.confidencePenalty ?? 0.15,
    severityEscalation: config?.severityEscalation ?? true,
    additionalPhases: config?.additionalPhases ?? ['approval'],
  };

  // Reduce confidence for production
  const elevatedConfidence = Math.max(
    0,
    summary.packet.approval_confidence - finalConfig.confidencePenalty
  );

  // Escalate risk severities if configured
  let elevatedRisks = summary.packet.risks;
  if (finalConfig.severityEscalation) {
    elevatedRisks = summary.packet.risks.map(risk => {
      const escalatedSeverity = escalateSeverity(risk.severity);
      return { ...risk, severity: escalatedSeverity };
    });
  }

  // Add additional phases
  const elevatedPhases = [
    ...summary.packet.phases_completed,
    ...finalConfig.additionalPhases.filter(
      p => !summary.packet.phases_completed.includes(p)
    ),
  ];

  // Regenerate summary with production context
  const elevatedSummary = generateSummary(
    summary.packet.status,
    elevatedConfidence,
    elevatedRisks,
    summary.packet.metrics
  ) + ' Production target requires additional approval.';

  // Build elevated packet
  const elevatedPacket: DecisionPacket = {
    ...summary.packet,
    approval_confidence: Math.round(elevatedConfidence * 100) / 100,
    risks: elevatedRisks,
    phases_completed: elevatedPhases,
    production_elevated: true,
    summary: elevatedSummary,
  };

  // Update recommendation
  const recommended = elevatedConfidence >= 0.8 && summary.packet.status !== 'failed';
  const reasons = [...summary.reasons];

  if (!recommended && recommended !== summary.recommended) {
    reasons.push('Production elevation reduced confidence below approval threshold');
  }

  if (finalConfig.additionalPhases.length > 0) {
    reasons.push(`Additional phases required for production: ${finalConfig.additionalPhases.join(', ')}`);
  }

  return {
    packet: elevatedPacket,
    recommended,
    reasons,
  };
}

/**
 * Escalates severity by one level.
 */
function escalateSeverity(severity: RiskSeverity): RiskSeverity {
  const escalation: Record<RiskSeverity, RiskSeverity> = {
    low: 'medium',
    medium: 'high',
    high: 'critical',
    critical: 'critical',
  };
  return escalation[severity];
}

/**
 * Creates a decision packet context from common inputs.
 * @param input - Request or result object
 * @returns Decision packet context
 */
export function createDecisionContext(
  input: Record<string, unknown>
): DecisionPacketContext {
  return {
    environment: determineEnvironment(input),
    timestamp: getCurrentTimestampUTC(),
    version: (input['version'] as string) ?? '1.0.0',
    commit_sha: process.env['GIT_SHA'] ?? undefined,
  };
}

/**
 * Creates decision packet metrics from result.
 * @param result - Planning result object
 * @returns Decision packet metrics
 */
export function createDecisionMetrics(
  result: Record<string, unknown>
): DecisionPacketMetrics {
  return {
    success_rate: calculateSuccessRate(result as { success?: boolean; results?: SynthesisResults }),
    failed_iterations: countBlockingIssues(result as { error?: { details?: unknown[] }; validationResult?: { errors?: unknown[] } }),
    blocking_issues: extractBlockingIssues(result as {
      error?: { details?: Array<{ path?: string; message?: string }> };
      validationResult?: { errors?: Array<{ path?: string; message?: string }> };
    }),
  };
}
