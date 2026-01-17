/**
 * Executive Synthesis Types
 *
 * Type definitions for decision packets, risk assessment,
 * and executive summary generation.
 *
 * Used by: plan create, plan approve commands
 * Excluded from: plan list, plan inspect, plan delete (read-only/destructive non-generative)
 */

import type { UUID, Timestamp, SHA256Hash } from '../types/common.js';
import type { SynthesisResults, SynthesisPlanStatus } from '../contracts/types.js';

/**
 * Environment classification for risk assessment.
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Risk severity levels.
 */
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Risk category classification.
 */
export type RiskCategory =
  | 'scope_creep'
  | 'constraint_violation'
  | 'dependency_conflict'
  | 'invalid_reference'
  | 'circular_dependency'
  | 'resource_exhaustion'
  | 'validation_failure'
  | 'execution_failure';

/**
 * Individual identified risk.
 */
export interface IdentifiedRisk {
  readonly id: string;
  readonly category: RiskCategory;
  readonly severity: RiskSeverity;
  readonly description: string;
  readonly affectedComponents: readonly string[];
  readonly detectedAt: Timestamp;
}

/**
 * Recommended mitigation for an identified risk.
 */
export interface Mitigation {
  readonly riskId: string;
  readonly action: string;
  readonly priority: 'immediate' | 'short_term' | 'long_term';
  readonly estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'significant' | 'major';
  readonly automated: boolean;
}

/**
 * Blocking issue that prevents plan approval.
 */
export interface BlockingIssue {
  readonly id: string;
  readonly category: RiskCategory;
  readonly description: string;
  readonly path?: string;
  readonly resolution?: string;
}

/**
 * Phases tracked for decision packet generation.
 */
export type SynthesisPhase = 'validation' | 'execution' | 'persistence' | 'approval';

/**
 * Decision packet context metadata.
 */
export interface DecisionPacketContext {
  readonly environment: Environment;
  readonly timestamp: Timestamp;
  readonly version: string;
  readonly commit_sha?: string;
}

/**
 * Decision packet metrics.
 */
export interface DecisionPacketMetrics {
  readonly success_rate: number;
  readonly failed_iterations: number;
  readonly blocking_issues: readonly BlockingIssue[];
}

/**
 * Executive Summary / Decision Packet
 *
 * Generated for plan create and plan approve operations.
 * Contains approval confidence, identified risks, and recommended mitigations.
 */
export interface DecisionPacket {
  /** Unique identifier for this decision packet */
  readonly packet_id: UUID;

  /** Type discriminator */
  readonly type: 'DecisionPacket';

  /** Context information */
  readonly context: DecisionPacketContext;

  /** Plan status */
  readonly status: SynthesisPlanStatus;

  /** Approval confidence (0.0 - 1.0) */
  readonly approval_confidence: number;

  /** Phases completed for this decision */
  readonly phases_completed: readonly SynthesisPhase[];

  /** Identified risks */
  readonly risks: readonly IdentifiedRisk[];

  /** Recommended mitigations */
  readonly mitigations: readonly Mitigation[];

  /** Summary metrics */
  readonly metrics: DecisionPacketMetrics;

  /** Results summary for synthesis compatibility */
  readonly results: SynthesisResults;

  /** Checksum for integrity verification */
  readonly checksum: SHA256Hash;

  /** Whether production risk elevation was applied */
  readonly production_elevated: boolean;

  /** Human-readable summary */
  readonly summary: string;
}

/**
 * Input for building an executive summary.
 */
export interface ExecutiveSummaryInput {
  /** Context for the decision */
  readonly context: DecisionPacketContext;

  /** Metrics from the operation */
  readonly metrics: DecisionPacketMetrics;

  /** Phases that were completed */
  readonly phases: readonly SynthesisPhase[];
}

/**
 * Result from building an executive summary.
 */
export interface ExecutiveSummaryResult {
  /** The generated decision packet */
  readonly packet: DecisionPacket;

  /** Whether the plan is recommended for approval */
  readonly recommended: boolean;

  /** Reasons for the recommendation */
  readonly reasons: readonly string[];
}

/**
 * Configuration for risk elevation.
 */
export interface RiskElevationConfig {
  /** Base confidence penalty for production (0.0 - 0.5) */
  readonly confidencePenalty: number;

  /** Severity escalation level (e.g., medium -> high) */
  readonly severityEscalation: boolean;

  /** Additional scrutiny phases required */
  readonly additionalPhases: readonly SynthesisPhase[];
}

/**
 * Default production risk elevation configuration.
 */
export const DEFAULT_PRODUCTION_ELEVATION: RiskElevationConfig = {
  confidencePenalty: 0.15,
  severityEscalation: true,
  additionalPhases: ['approval'],
};
