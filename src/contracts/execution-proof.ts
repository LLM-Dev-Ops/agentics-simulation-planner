/**
 * @agentics/contracts - Execution Proof Generator
 * Creates cryptographic execution proofs for all planning operations.
 * Even planning-only responses MUST include execution proof.
 */

import type {
  ExecutionProof,
  ExecutionProofEntry,
} from './types.js';
import type { UUID, SHA256Hash, AuditEntry } from '../types/index.js';
import { generateDeterministicId, hashSHA256 } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';
import { CONTRACT_VERSION } from './validator.js';

/** Planner version for proof generation */
const PLANNER_VERSION = '1.0.0';

/**
 * Execution proof builder for tracking planning operations.
 */
export class ExecutionProofBuilder {
  private readonly sessionId: UUID;
  private readonly requestHash: SHA256Hash;
  private readonly entries: ExecutionProofEntry[] = [];
  private readonly startTime: number;

  constructor(sessionId: UUID, requestData: unknown) {
    this.sessionId = sessionId;
    this.requestHash = hashSHA256(JSON.stringify(requestData));
    this.startTime = Date.now();
  }

  /**
   * Records a stage execution.
   */
  recordStage(
    stage: string,
    operation: string,
    inputData: unknown,
    outputData: unknown,
    decision: string,
    metadata?: Record<string, unknown>
  ): void {
    const stageStartTime = Date.now();
    const inputHash = hashSHA256(JSON.stringify(inputData));
    const outputHash = hashSHA256(JSON.stringify(outputData));

    this.entries.push({
      stage,
      operation,
      timestamp: getCurrentTimestampUTC(),
      inputHash,
      outputHash,
      durationMs: Date.now() - stageStartTime,
      decision,
      metadata,
    });
  }

  /**
   * Records an entry from an existing audit trail entry.
   */
  recordFromAudit(auditEntry: AuditEntry, inputData: unknown, outputData: unknown): void {
    this.entries.push({
      stage: auditEntry.stage,
      operation: auditEntry.operation,
      timestamp: auditEntry.timestamp,
      inputHash: auditEntry.inputHash ?? hashSHA256(JSON.stringify(inputData)),
      outputHash: auditEntry.contentHash ?? hashSHA256(JSON.stringify(outputData)),
      durationMs: 0, // Duration not tracked in audit entries
      decision: auditEntry.decision,
      metadata: auditEntry.metrics,
    });
  }

  /**
   * Builds the final execution proof.
   */
  build(responseData: unknown): ExecutionProof {
    const responseHash = hashSHA256(JSON.stringify(responseData));
    const totalDurationMs = Date.now() - this.startTime;
    const proofId = generateDeterministicId(
      'proof',
      this.sessionId,
      this.requestHash,
      String(totalDurationMs)
    );

    return {
      proofId,
      sessionId: this.sessionId,
      requestHash: this.requestHash,
      responseHash,
      entries: [...this.entries],
      totalDurationMs,
      stageCount: this.entries.length,
      createdAt: getCurrentTimestampUTC(),
      plannerVersion: PLANNER_VERSION,
      contractVersion: CONTRACT_VERSION,
    };
  }
}

/**
 * Creates an execution proof from audit trail entries.
 * Used when converting existing audit trails to execution proofs.
 */
export function createExecutionProofFromAuditTrail(
  sessionId: UUID,
  requestData: unknown,
  responseData: unknown,
  auditTrail: readonly AuditEntry[],
  totalDurationMs: number
): ExecutionProof {
  const requestHash = hashSHA256(JSON.stringify(requestData));
  const responseHash = hashSHA256(JSON.stringify(responseData));

  const entries: ExecutionProofEntry[] = auditTrail.map(audit => ({
    stage: audit.stage,
    operation: audit.operation,
    timestamp: audit.timestamp,
    inputHash: audit.inputHash ?? hashSHA256(''),
    outputHash: audit.contentHash ?? hashSHA256(''),
    durationMs: 0,
    decision: audit.decision,
    metadata: audit.metrics,
  }));

  const proofId = generateDeterministicId(
    'proof',
    sessionId,
    requestHash,
    String(totalDurationMs)
  );

  return {
    proofId,
    sessionId,
    requestHash,
    responseHash,
    entries,
    totalDurationMs,
    stageCount: entries.length,
    createdAt: getCurrentTimestampUTC(),
    plannerVersion: PLANNER_VERSION,
    contractVersion: CONTRACT_VERSION,
  };
}

/**
 * Creates a minimal execution proof for validation-only failures.
 * Even failed requests must have an execution proof documenting the failure.
 */
export function createValidationFailureProof(
  requestData: unknown,
  validationErrors: readonly { path: string; message: string }[]
): ExecutionProof {
  const sessionId = generateDeterministicId('validation-failure', getCurrentTimestampUTC());
  const requestHash = hashSHA256(JSON.stringify(requestData));
  const responseHash = hashSHA256(JSON.stringify(validationErrors));

  const entry: ExecutionProofEntry = {
    stage: 'CONTRACT_VALIDATION',
    operation: 'VALIDATE_REQUEST',
    timestamp: getCurrentTimestampUTC(),
    inputHash: requestHash,
    outputHash: responseHash,
    durationMs: 0,
    decision: 'REJECTED',
    metadata: {
      errorCount: validationErrors.length,
      errorPaths: validationErrors.map(e => e.path),
    },
  };

  return {
    proofId: generateDeterministicId('proof', sessionId, requestHash),
    sessionId,
    requestHash,
    responseHash,
    entries: [entry],
    totalDurationMs: 0,
    stageCount: 1,
    createdAt: getCurrentTimestampUTC(),
    plannerVersion: PLANNER_VERSION,
    contractVersion: CONTRACT_VERSION,
  };
}

/**
 * Verifies that an execution proof is complete and valid.
 */
export function verifyExecutionProof(proof: ExecutionProof): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check required fields
  if (!proof.proofId) {
    issues.push('Missing proofId');
  }
  if (!proof.sessionId) {
    issues.push('Missing sessionId');
  }
  if (!proof.requestHash) {
    issues.push('Missing requestHash');
  }
  if (!proof.responseHash) {
    issues.push('Missing responseHash');
  }
  if (!proof.entries || proof.entries.length === 0) {
    issues.push('Execution proof must have at least one entry');
  }
  if (proof.stageCount !== proof.entries.length) {
    issues.push(`Stage count mismatch: ${proof.stageCount} vs ${proof.entries.length}`);
  }

  // Validate each entry
  for (let i = 0; i < proof.entries.length; i++) {
    const entry = proof.entries[i]!;
    if (!entry.stage) {
      issues.push(`Entry ${i}: missing stage`);
    }
    if (!entry.operation) {
      issues.push(`Entry ${i}: missing operation`);
    }
    if (!entry.timestamp) {
      issues.push(`Entry ${i}: missing timestamp`);
    }
    if (!entry.inputHash) {
      issues.push(`Entry ${i}: missing inputHash`);
    }
    if (!entry.outputHash) {
      issues.push(`Entry ${i}: missing outputHash`);
    }
    if (!entry.decision) {
      issues.push(`Entry ${i}: missing decision`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
