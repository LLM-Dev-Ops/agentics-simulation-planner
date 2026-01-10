/**
 * Unit tests for intent ingestion module
 */

import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { ValidationError } from '../../src/types/errors.js';
import { createMinimalContext } from '../../src/core/planner.js';
import { generateDeterministicId } from '../../src/utils/crypto.js';

describe('Intent Ingestion Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  describe('input validation', () => {
    it('should reject empty intent', async () => {
      const input: IntentIngestionInput = {
        rawIntent: '',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      await expect(ingestIntent(input, adapter)).rejects.toThrow(ValidationError);
    });

    it('should reject intent exceeding max length', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'a'.repeat(100001),
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      await expect(ingestIntent(input, adapter)).rejects.toThrow(ValidationError);
    });

    it('should accept missing organizational context (now optional for CLI compatibility)', async () => {
      const input = {
        rawIntent: 'Reduce costs',
        organizationalContext: null as unknown as ReturnType<typeof createMinimalContext>,
        sessionId,
      };

      // Organizational context is now optional - the planner provides defaults
      const result = await ingestIntent(input, adapter);
      expect(result.rawInput).toBe('Reduce costs');
      expect(result.context).toBeNull();
    });
  });

  describe('text normalization', () => {
    it('should normalize whitespace', async () => {
      const input: IntentIngestionInput = {
        rawIntent: '  Reduce   costs   by   20%  ',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      expect(result.normalizedInput).toBe('Reduce costs by 20%');
    });

    it('should handle unicode text', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs in München office',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      expect(result.normalizedInput).toContain('München');
    });
  });

  describe('tokenization', () => {
    it('should extract action tokens', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce operational costs by 20%',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      const actionTokens = result.tokens.filter(t => t.type === 'ACTION');
      expect(actionTokens.length).toBeGreaterThan(0);
    });

    it('should extract quantifier tokens', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by 20% and deploy 500 agents',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      const quantTokens = result.tokens.filter(t => t.type === 'QUANTIFIER');
      expect(quantTokens.length).toBeGreaterThan(0);
    });

    it('should extract temporal tokens', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by Q3 2024',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      const temporalTokens = result.tokens.filter(t => t.type === 'TEMPORAL');
      expect(temporalTokens.length).toBeGreaterThan(0);
    });
  });

  describe('component extraction', () => {
    it('should extract objectives', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by 20% in manufacturing',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      expect(result.components.objectives.length).toBeGreaterThan(0);
    });

    it('should extract quantitative requirements', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Deploy 500 agents to handle 10000 daily requests',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      expect(result.components.quantitativeRequirements.length).toBeGreaterThan(0);
    });

    it('should extract temporal constraints', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce operational costs by 20% by Q4',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);
      expect(result.components.temporalConstraints.length).toBeGreaterThan(0);
    });
  });

  describe('determinism', () => {
    it('should produce identical output for identical input', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by 20%',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result1 = await ingestIntent(input, adapter);

      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-seed',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      const input2: IntentIngestionInput = {
        ...input,
        sessionId: newSessionId,
      };
      const result2 = await ingestIntent(input2, adapter);

      expect(result1.inputHash).toBe(result2.inputHash);
    });
  });

  describe('ruvvector storage', () => {
    it('should store structured intent in ruvvector', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by 20%',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      const result = await ingestIntent(input, adapter);

      const stored = await adapter.retrieve(`intent:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should append audit entry', async () => {
      const input: IntentIngestionInput = {
        rawIntent: 'Reduce costs by 20%',
        organizationalContext: createMinimalContext('Test'),
        sessionId,
      };

      await ingestIntent(input, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.length).toBeGreaterThan(0);
      expect(trail.some(e => e.stage === 'INTENT_INGESTION')).toBe(true);
    });
  });
});
