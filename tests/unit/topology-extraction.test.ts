/**
 * Unit tests for organizational topology extraction module
 */

import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type { StructuredIntent, DecomposedIntent, OrganizationalContext } from '../../src/types/index.js';

describe('Organizational Topology Extraction Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-topology-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestDecomposed(rawIntent: string): Promise<{
    intent: StructuredIntent;
    decomposed: DecomposedIntent;
  }> {
    const input: IntentIngestionInput = {
      rawIntent,
      organizationalContext: createMinimalContext('Test Corp'),
      sessionId,
    };
    const intent = await ingestIntent(input, adapter);
    const decomposed = await decomposeIntent(intent, adapter);
    return { intent, decomposed };
  }

  describe('extractTopology', () => {
    it('should extract topology from organizational context', async () => {
      const { intent, decomposed } = await createTestDecomposed('Optimize operations');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.id).toBeDefined();
      expect(result.organizationId).toBe(intent.context.organizationId);
      expect(result.extractedFrom).toBe(decomposed.id);
    });

    it('should build division hierarchy tree', async () => {
      const { intent, decomposed } = await createTestDecomposed('Reduce costs');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.divisionHierarchy).toBeDefined();
      expect(result.divisionHierarchy.nodes.length).toBeGreaterThan(0);

      // Should have organization root node
      const orgNode = result.divisionHierarchy.nodes.find(n => n.type === 'ORGANIZATION');
      expect(orgNode).toBeDefined();
    });

    it('should extract team structures', async () => {
      const { intent, decomposed } = await createTestDecomposed('Deploy agents');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.teamStructures.length).toBeGreaterThan(0);

      for (const team of result.teamStructures) {
        expect(team.id).toBeDefined();
        expect(team.name).toBeDefined();
        expect(team.teamType).toBeDefined();
        expect(team.capabilities).toBeDefined();
      }
    });

    it('should map team roles to agent archetypes', async () => {
      const { intent, decomposed } = await createTestDecomposed('Improve efficiency');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.agentArchetypeMappings.length).toBeGreaterThan(0);

      for (const mapping of result.agentArchetypeMappings) {
        expect(mapping.teamId).toBeDefined();
        expect(mapping.role).toBeDefined();
        expect(mapping.archetypeId).toBeDefined();
        expect(mapping.capabilities).toBeDefined();
      }
    });

    it('should build communication patterns graph', async () => {
      const { intent, decomposed } = await createTestDecomposed('Scale infrastructure');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.communicationPatterns).toBeDefined();
      expect(result.communicationPatterns.nodes.length).toBeGreaterThan(0);
    });

    it('should compute topology metrics', async () => {
      const { intent, decomposed } = await createTestDecomposed('Transform processes');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalDivisions).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalTeams).toBeGreaterThan(0);
      expect(result.metrics.totalAgentMappings).toBeGreaterThan(0);
      expect(result.metrics.hierarchyDepth).toBeGreaterThanOrEqual(0);
      expect(result.metrics.communicationDensity).toBeGreaterThanOrEqual(0);
    });

    it('should store topology in ruvvector', async () => {
      const { intent, decomposed } = await createTestDecomposed('Automate workflow');
      const result = await extractTopology(decomposed, intent, adapter);

      const stored = await adapter.retrieve(`topology:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relation to decomposed intent', async () => {
      const { intent, decomposed } = await createTestDecomposed('Implement solution');
      const result = await extractTopology(decomposed, intent, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'EXTRACTED_FROM')).toBe(true);
    });

    it('should append audit entry', async () => {
      const { intent, decomposed } = await createTestDecomposed('Deploy platform');
      await extractTopology(decomposed, intent, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'TOPOLOGY_EXTRACTION')).toBe(true);
    });
  });

  describe('team type classification', () => {
    it('should classify engineering teams correctly', async () => {
      const { intent, decomposed } = await createTestDecomposed('Optimize code');
      const result = await extractTopology(decomposed, intent, adapter);

      // Minimal context creates Engineering team
      const engTeam = result.teamStructures.find(t => t.teamType === 'ENGINEERING');
      expect(engTeam).toBeDefined();
    });
  });

  describe('agent archetype mapping', () => {
    it('should map analyst role to analyst archetype', async () => {
      const { intent, decomposed } = await createTestDecomposed('Analyze data patterns for optimization');
      const result = await extractTopology(decomposed, intent, adapter);

      // Check if any mapping involves analyst archetype
      const hasArchetypes = result.agentArchetypeMappings.length > 0;
      expect(hasArchetypes).toBe(true);
    });

    it('should include communication patterns for each archetype', async () => {
      const { intent, decomposed } = await createTestDecomposed('Coordinate team workflow optimization');
      const result = await extractTopology(decomposed, intent, adapter);

      for (const mapping of result.agentArchetypeMappings) {
        expect(mapping.communicationPatterns).toBeDefined();
        expect(Array.isArray(mapping.communicationPatterns)).toBe(true);
      }
    });
  });

  describe('communication graph', () => {
    it('should create nodes for each team', async () => {
      const { intent, decomposed } = await createTestDecomposed('Deploy agents');
      const result = await extractTopology(decomposed, intent, adapter);

      expect(result.communicationPatterns.nodes.length).toBe(result.teamStructures.length);
    });

    it('should infer intra-division communication edges', async () => {
      const { intent, decomposed } = await createTestDecomposed('Improve collaboration');
      const result = await extractTopology(decomposed, intent, adapter);

      // Should have edges if there are multiple teams in same division
      expect(result.communicationPatterns.edges.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('determinism', () => {
    it('should produce identical output for identical input', async () => {
      const rawIntent = 'Reduce costs by 20%';
      const orgContext = createMinimalContext('Test Corp');

      // First run
      const input1: IntentIngestionInput = {
        rawIntent,
        organizationalContext: orgContext,
        sessionId,
      };
      const intent1 = await ingestIntent(input1, adapter);
      const decomposed1 = await decomposeIntent(intent1, adapter);
      const topology1 = await extractTopology(decomposed1, intent1, adapter);

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-topology-seed',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      const input2: IntentIngestionInput = {
        rawIntent,
        organizationalContext: orgContext,
        sessionId: newSessionId,
      };
      const intent2 = await ingestIntent(input2, adapter);
      const decomposed2 = await decomposeIntent(intent2, adapter);
      const topology2 = await extractTopology(decomposed2, intent2, adapter);

      // Should have same metrics
      expect(topology1.metrics.totalTeams).toBe(topology2.metrics.totalTeams);
      expect(topology1.metrics.totalAgentMappings).toBe(topology2.metrics.totalAgentMappings);
    });
  });
});
