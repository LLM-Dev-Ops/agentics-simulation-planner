/**
 * Execution Proof Tests
 * Tests for execution proof generation and verification
 */

import {
  ExecutionProofBuilder,
  createExecutionProofFromAuditTrail,
  createValidationFailureProof,
  verifyExecutionProof,
  type ExecutionProof,
} from '../../../src/contracts/index.js';
import type { AuditEntry } from '../../../src/types/index.js';

describe('Execution Proof', () => {
  describe('ExecutionProofBuilder', () => {
    it('should create a valid execution proof with stages', () => {
      const builder = new ExecutionProofBuilder(
        '12345678-1234-1234-1234-123456789abc',
        { intent: 'Test intent' }
      );

      builder.recordStage(
        'INTENT_INGESTION',
        'INGEST_INTENT',
        { rawIntent: 'Test intent' },
        { tokens: ['test', 'intent'] },
        'COMPLETED',
        { tokenCount: 2 }
      );

      builder.recordStage(
        'INTENT_DECOMPOSITION',
        'DECOMPOSE_INTENT',
        { id: 'structured-1' },
        { objectives: ['obj-1'] },
        'COMPLETED',
        { objectiveCount: 1 }
      );

      const proof = builder.build({ plan: { id: 'plan-1' } });

      expect(proof.proofId).toBeDefined();
      expect(proof.sessionId).toBe('12345678-1234-1234-1234-123456789abc');
      expect(proof.requestHash).toBeDefined();
      expect(proof.responseHash).toBeDefined();
      expect(proof.entries).toHaveLength(2);
      expect(proof.stageCount).toBe(2);
      expect(proof.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(proof.createdAt).toBeDefined();
      expect(proof.plannerVersion).toBeDefined();
      expect(proof.contractVersion).toBeDefined();
    });

    it('should record stage metadata correctly', () => {
      const builder = new ExecutionProofBuilder('session-123', { intent: 'Test' });

      builder.recordStage(
        'TEST_STAGE',
        'TEST_OPERATION',
        { input: 'data' },
        { output: 'result' },
        'SUCCESS',
        { custom: 'metadata', count: 42 }
      );

      const proof = builder.build({});

      expect(proof.entries[0]!.stage).toBe('TEST_STAGE');
      expect(proof.entries[0]!.operation).toBe('TEST_OPERATION');
      expect(proof.entries[0]!.decision).toBe('SUCCESS');
      expect(proof.entries[0]!.metadata).toEqual({ custom: 'metadata', count: 42 });
    });

    it('should generate deterministic hashes for same input', () => {
      const request = { intent: 'Consistent input' };

      const builder1 = new ExecutionProofBuilder('session-1', request);
      builder1.recordStage('STAGE', 'OP', { x: 1 }, { y: 2 }, 'OK');
      const proof1 = builder1.build({ result: 'same' });

      const builder2 = new ExecutionProofBuilder('session-1', request);
      builder2.recordStage('STAGE', 'OP', { x: 1 }, { y: 2 }, 'OK');
      const proof2 = builder2.build({ result: 'same' });

      expect(proof1.requestHash).toBe(proof2.requestHash);
    });
  });

  describe('createExecutionProofFromAuditTrail', () => {
    it('should convert audit trail to execution proof', () => {
      const auditTrail: AuditEntry[] = [
        {
          stage: 'INTENT_INGESTION',
          operation: 'INGEST',
          timestamp: '2024-01-01T00:00:00.000Z',
          decision: 'COMPLETED',
          inputHash: 'abc123',
          contentHash: 'def456',
          metrics: { tokenCount: 10 },
        },
        {
          stage: 'INTENT_DECOMPOSITION',
          operation: 'DECOMPOSE',
          timestamp: '2024-01-01T00:00:01.000Z',
          decision: 'COMPLETED',
          inputHash: 'ghi789',
          contentHash: 'jkl012',
          metrics: { objectiveCount: 3 },
        },
      ];

      const proof = createExecutionProofFromAuditTrail(
        'session-123',
        { intent: 'Test' },
        { plan: {} },
        auditTrail,
        1000
      );

      expect(proof.sessionId).toBe('session-123');
      expect(proof.entries).toHaveLength(2);
      expect(proof.totalDurationMs).toBe(1000);
      expect(proof.stageCount).toBe(2);

      expect(proof.entries[0]!.stage).toBe('INTENT_INGESTION');
      expect(proof.entries[0]!.inputHash).toBe('abc123');
      expect(proof.entries[0]!.outputHash).toBe('def456');

      expect(proof.entries[1]!.stage).toBe('INTENT_DECOMPOSITION');
      expect(proof.entries[1]!.metadata).toEqual({ objectiveCount: 3 });
    });
  });

  describe('createValidationFailureProof', () => {
    it('should create proof for validation failure', () => {
      const errors = [
        { path: '/intent', message: 'Required field missing' },
        { path: '/config/scope', message: 'Invalid scope type' },
      ];

      const proof = createValidationFailureProof({ invalid: 'request' }, errors);

      expect(proof.proofId).toBeDefined();
      expect(proof.sessionId).toBeDefined();
      expect(proof.entries).toHaveLength(1);
      expect(proof.entries[0]!.stage).toBe('CONTRACT_VALIDATION');
      expect(proof.entries[0]!.operation).toBe('VALIDATE_REQUEST');
      expect(proof.entries[0]!.decision).toBe('REJECTED');
      expect(proof.entries[0]!.metadata).toEqual({
        errorCount: 2,
        errorPaths: ['/intent', '/config/scope'],
      });
      expect(proof.stageCount).toBe(1);
    });

    it('should handle empty error list', () => {
      const proof = createValidationFailureProof({}, []);

      expect(proof.entries[0]!.metadata).toEqual({
        errorCount: 0,
        errorPaths: [],
      });
    });
  });

  describe('verifyExecutionProof', () => {
    it('should validate a complete execution proof', () => {
      const builder = new ExecutionProofBuilder('session-123', { intent: 'Test' });
      builder.recordStage('STAGE', 'OP', {}, {}, 'OK');
      const proof = builder.build({});

      const result = verifyExecutionProof(proof);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing proofId', () => {
      const proof: ExecutionProof = {
        proofId: '',
        sessionId: 'session-123',
        requestHash: 'hash',
        responseHash: 'hash',
        entries: [
          {
            stage: 'TEST',
            operation: 'OP',
            timestamp: '2024-01-01T00:00:00.000Z',
            inputHash: 'in',
            outputHash: 'out',
            durationMs: 0,
            decision: 'OK',
          },
        ],
        totalDurationMs: 0,
        stageCount: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        plannerVersion: '1.0.0',
        contractVersion: '1.0.0',
      };

      const result = verifyExecutionProof(proof);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing proofId');
    });

    it('should detect empty entries', () => {
      const proof: ExecutionProof = {
        proofId: 'proof-123',
        sessionId: 'session-123',
        requestHash: 'hash',
        responseHash: 'hash',
        entries: [],
        totalDurationMs: 0,
        stageCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        plannerVersion: '1.0.0',
        contractVersion: '1.0.0',
      };

      const result = verifyExecutionProof(proof);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Execution proof must have at least one entry');
    });

    it('should detect stage count mismatch', () => {
      const proof: ExecutionProof = {
        proofId: 'proof-123',
        sessionId: 'session-123',
        requestHash: 'hash',
        responseHash: 'hash',
        entries: [
          {
            stage: 'TEST',
            operation: 'OP',
            timestamp: '2024-01-01T00:00:00.000Z',
            inputHash: 'in',
            outputHash: 'out',
            durationMs: 0,
            decision: 'OK',
          },
        ],
        totalDurationMs: 0,
        stageCount: 5, // Mismatch: should be 1
        createdAt: '2024-01-01T00:00:00.000Z',
        plannerVersion: '1.0.0',
        contractVersion: '1.0.0',
      };

      const result = verifyExecutionProof(proof);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Stage count mismatch'))).toBe(true);
    });

    it('should detect missing fields in entries', () => {
      const proof: ExecutionProof = {
        proofId: 'proof-123',
        sessionId: 'session-123',
        requestHash: 'hash',
        responseHash: 'hash',
        entries: [
          {
            stage: '',
            operation: 'OP',
            timestamp: '2024-01-01T00:00:00.000Z',
            inputHash: 'in',
            outputHash: 'out',
            durationMs: 0,
            decision: 'OK',
          },
        ],
        totalDurationMs: 0,
        stageCount: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        plannerVersion: '1.0.0',
        contractVersion: '1.0.0',
      };

      const result = verifyExecutionProof(proof);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('missing stage'))).toBe(true);
    });
  });
});
