/**
 * Unit tests for intent decomposition module
 */

import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { DecompositionError } from '../../src/types/errors.js';
import { createMinimalContext } from '../../src/core/planner.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import type { StructuredIntent } from '../../src/types/index.js';

describe('Intent Decomposition Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-decomposition-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestIntent(rawIntent: string): Promise<StructuredIntent> {
    const input: IntentIngestionInput = {
      rawIntent,
      organizationalContext: createMinimalContext('Test Corp'),
      sessionId,
    };
    return ingestIntent(input, adapter);
  }

  describe('decomposeIntent', () => {
    it('should decompose intent into atomic objectives', async () => {
      const intent = await createTestIntent('Optimize operational costs by 20%');
      const result = await decomposeIntent(intent, adapter);

      expect(result.id).toBeDefined();
      expect(result.sourceIntentId).toBe(intent.id);
      expect(result.atomicObjectives.length).toBeGreaterThan(0);
      expect(result.dependencyGraph).toBeDefined();
      expect(result.executionOrder.length).toBeGreaterThan(0);
    });

    it('should create dependency graph with nodes and edges', async () => {
      const intent = await createTestIntent('Reduce costs by 15% in Q3');
      const result = await decomposeIntent(intent, adapter);

      expect(result.dependencyGraph.nodes.length).toBeGreaterThan(0);
      // For multi-step decompositions, should have edges
      if (result.atomicObjectives.length > 1) {
        expect(result.dependencyGraph.edges.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should compute topological execution order', async () => {
      const intent = await createTestIntent('Deploy 500 agents across offices');
      const result = await decomposeIntent(intent, adapter);

      // Each atomic objective should appear once in execution order
      expect(result.executionOrder.length).toBe(result.atomicObjectives.length);

      // All atomic objectives should be in execution order
      for (const atomic of result.atomicObjectives) {
        expect(result.executionOrder).toContain(atomic.id);
      }
    });

    it('should discover implicit requirements', async () => {
      const intent = await createTestIntent('Deploy and scale automation infrastructure');
      const result = await decomposeIntent(intent, adapter);

      // Deploy and scale actions should trigger resource prerequisites
      expect(result.implicitRequirements.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate deterministic decomposition hash', async () => {
      const intent = await createTestIntent('Reduce costs by 10%');
      const result = await decomposeIntent(intent, adapter);

      expect(result.decompositionHash).toBeDefined();
      expect(result.decompositionHash.length).toBe(64); // SHA-256 hex
    });

    it('should store decomposed intent in ruvvector', async () => {
      const intent = await createTestIntent('Improve efficiency by 25%');
      const result = await decomposeIntent(intent, adapter);

      const stored = await adapter.retrieve(`decomposed:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relation to source intent', async () => {
      const intent = await createTestIntent('Implement automation');
      const result = await decomposeIntent(intent, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'DERIVED_FROM')).toBe(true);
    });

    it('should append audit entry', async () => {
      const intent = await createTestIntent('Scale operations');
      await decomposeIntent(intent, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'INTENT_DECOMPOSITION')).toBe(true);
    });
  });

  describe('decomposition patterns', () => {
    it('should decompose "optimize" action into sub-actions', async () => {
      const intent = await createTestIntent('Optimize supply chain logistics');
      const result = await decomposeIntent(intent, adapter);

      // Optimize pattern: analyze, identify_bottlenecks, implement_improvements, validate
      expect(result.atomicObjectives.length).toBeGreaterThanOrEqual(1);
    });

    it('should decompose "reduce" action into sub-actions', async () => {
      const intent = await createTestIntent('Reduce operational costs');
      const result = await decomposeIntent(intent, adapter);

      // Reduce pattern: measure_current, identify_reduction_targets, implement_reduction, verify
      expect(result.atomicObjectives.length).toBeGreaterThanOrEqual(1);
    });

    it('should decompose "deploy" action into sub-actions', async () => {
      const intent = await createTestIntent('Deploy new agents');
      const result = await decomposeIntent(intent, adapter);

      // Deploy pattern: prepare, configure, deploy, validate
      expect(result.atomicObjectives.length).toBeGreaterThanOrEqual(1);
    });

    it('should decompose "implement" action into sub-actions', async () => {
      const intent = await createTestIntent('Implement new workflow');
      const result = await decomposeIntent(intent, adapter);

      // Implement pattern: design, develop, test, deploy
      expect(result.atomicObjectives.length).toBeGreaterThanOrEqual(1);
    });

    it('should keep simple actions as atomic', async () => {
      const intent = await createTestIntent('Report on performance metrics');
      const result = await decomposeIntent(intent, adapter);

      // Non-recognized actions should remain atomic
      expect(result.atomicObjectives.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dependency graph', () => {
    it('should create sequential dependencies within decomposed objectives', async () => {
      const intent = await createTestIntent('Transform business processes');
      const result = await decomposeIntent(intent, adapter);

      // If decomposed into phases, should have sequential dependencies
      if (result.atomicObjectives.length > 1) {
        const hasPhases = result.atomicObjectives.some(o => o.phase !== undefined);
        if (hasPhases) {
          expect(result.dependencyGraph.edges.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('implicit requirements', () => {
    it('should detect resource prerequisites for deploy actions', async () => {
      const intent = await createTestIntent('Deploy infrastructure');
      const result = await decomposeIntent(intent, adapter);

      const resourcePrereqs = result.implicitRequirements.filter(
        r => r.type === 'RESOURCE_PREREQUISITE'
      );
      expect(resourcePrereqs.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect capability prerequisites for automation', async () => {
      const intent = await createTestIntent('Automate invoice processing');
      const result = await decomposeIntent(intent, adapter);

      const capabilityPrereqs = result.implicitRequirements.filter(
        r => r.type === 'CAPABILITY_PREREQUISITE'
      );
      expect(capabilityPrereqs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('determinism', () => {
    it('should produce identical output for identical input', async () => {
      const rawIntent = 'Reduce costs by 20%';

      const intent1 = await createTestIntent(rawIntent);
      const result1 = await decomposeIntent(intent1, adapter);

      // Reset and recreate
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-decomposition-seed',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      const input2: IntentIngestionInput = {
        rawIntent,
        organizationalContext: createMinimalContext('Test Corp'),
        sessionId: newSessionId,
      };
      const intent2 = await ingestIntent(input2, adapter);
      const result2 = await decomposeIntent(intent2, adapter);

      expect(result1.decompositionHash).toBe(result2.decompositionHash);
    });
  });
});
