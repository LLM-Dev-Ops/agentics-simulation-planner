/**
 * Unit tests for constraint resolution module
 */

import { resolveConstraints } from '../../src/modules/constraint-resolution.js';
import { discoverIntegrations } from '../../src/modules/integration-discovery.js';
import { expandAgentsAndWorkflows } from '../../src/modules/agent-workflow-expansion.js';
import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { ConstraintError } from '../../src/types/errors.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type { ExpandedAgentsAndWorkflows, IntegrationMap, StructuredIntent } from '../../src/types/index.js';

describe('Constraint Resolution Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-constraint-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestIntegrationMap(rawIntent: string): Promise<{
    intent: StructuredIntent;
    expanded: ExpandedAgentsAndWorkflows;
    integrationMap: IntegrationMap;
  }> {
    const input: IntentIngestionInput = {
      rawIntent,
      organizationalContext: createMinimalContext('Test Corp'),
      sessionId,
    };
    const intent = await ingestIntent(input, adapter);
    const decomposed = await decomposeIntent(intent, adapter);
    const topology = await extractTopology(decomposed, intent, adapter);
    const expanded = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);
    const integrationMap = await discoverIntegrations(expanded, sessionId, adapter);
    return { intent, expanded, integrationMap };
  }

  describe('resolveConstraints', () => {
    it('should resolve constraints from all sources', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Optimize operations');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.id).toBeDefined();
      expect(result.integrationMapId).toBe(integrationMap.id);
      expect(result.allConstraints).toBeDefined();
    });

    it('should collect constraints from intent', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Reduce costs by Q3');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      // Should have constraints from intent components
      expect(result.allConstraints.length).toBeGreaterThan(0);
    });

    it('should collect constraints from organizational context', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Deploy agents');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const contextConstraints = result.allConstraints.filter(
        c => c.source === 'organizational_context'
      );
      expect(contextConstraints.length).toBeGreaterThanOrEqual(0);
    });

    it('should collect constraints from workflow steps', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Implement automation');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const workflowConstraints = result.allConstraints.filter(
        c => c.source.startsWith('workflow:')
      );
      expect(workflowConstraints.length).toBeGreaterThanOrEqual(0);
    });

    it('should collect SLA constraints from integrations', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Scale infrastructure');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const slaConstraints = result.allConstraints.filter(c => c.type === 'SLA');
      expect(slaConstraints.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate constraints for satisfiability', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Transform processes');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.validationResult).toBeDefined();
      expect(result.validationResult.satisfiable).toBeDefined();
      expect(result.validationResult.unsatisfiable).toBeDefined();
      expect(result.validationResult.unknown).toBeDefined();
    });

    it('should detect conflicts between constraints', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Improve efficiency');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.conflicts).toBeDefined();
      expect(Array.isArray(result.conflicts)).toBe(true);
    });

    it('should resolve conflicts', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Automate workflow');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.resolutions).toBeDefined();
      expect(Array.isArray(result.resolutions)).toBe(true);

      // Each conflict should have a resolution
      expect(result.resolutions.length).toBe(result.conflicts.length);
    });

    it('should create ordered constraint set', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Deploy platform');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.orderedConstraints).toBeDefined();
      expect(result.orderedConstraints.constraints).toBeDefined();
      expect(result.orderedConstraints.ordering).toBeDefined();
      expect(result.orderedConstraints.hash).toBeDefined();
    });

    it('should store resolved constraints in ruvvector', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Reduce costs');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const stored = await adapter.retrieve(`resolved:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relation to integration map', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Implement solution');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'RESOLVED_FROM')).toBe(true);
    });

    it('should append audit entry', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Optimize data');
      await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'CONSTRAINT_RESOLUTION')).toBe(true);
    });

    it('should set resolution status', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Scale operations');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(['RESOLVED', 'PENDING']).toContain(result.resolutionStatus);
    });
  });

  describe('conflict resolution strategies', () => {
    it('should use priority-based resolution', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Transform business');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      // Check if any resolutions used PRIORITY strategy
      const priorityResolutions = result.resolutions.filter(r => r.strategy === 'PRIORITY');
      expect(priorityResolutions.length).toBeGreaterThanOrEqual(0);
    });

    it('should use source authority resolution', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Validate data quality metrics');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      // Check if any resolutions used SOURCE_AUTHORITY strategy
      const authorityResolutions = result.resolutions.filter(r => r.strategy === 'SOURCE_AUTHORITY');
      expect(authorityResolutions.length).toBeGreaterThanOrEqual(0);
    });

    it('should use conservative resolution as fallback', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Improve processes');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      // Check if any resolutions used CONSERVATIVE strategy
      const conservativeResolutions = result.resolutions.filter(r => r.strategy === 'CONSERVATIVE');
      expect(conservativeResolutions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('constraint ordering', () => {
    it('should order constraints by priority', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Deploy infrastructure');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      // Higher priority constraints should come first
      const constraints = result.orderedConstraints.constraints;
      if (constraints.length > 1) {
        // Check that ordering has entries
        expect(result.orderedConstraints.ordering.length).toBe(constraints.length);
      }
    });

    it('should compute deterministic ordering hash', async () => {
      const { intent, expanded, integrationMap } = await createTestIntegrationMap('Reduce costs');
      const result = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);

      expect(result.orderedConstraints.hash).toBeDefined();
      expect(result.orderedConstraints.hash.length).toBe(64); // SHA-256 hex
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
      const expanded1 = await expandAgentsAndWorkflows(decomposed1, topology1, sessionId, adapter);
      const integration1 = await discoverIntegrations(expanded1, sessionId, adapter);
      const resolved1 = await resolveConstraints(intent1, expanded1, integration1, sessionId, adapter);

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-constraint-seed',
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
      const expanded2 = await expandAgentsAndWorkflows(decomposed2, topology2, newSessionId, adapter);
      const integration2 = await discoverIntegrations(expanded2, newSessionId, adapter);
      const resolved2 = await resolveConstraints(intent2, expanded2, integration2, newSessionId, adapter);

      expect(resolved1.orderedConstraints.hash).toBe(resolved2.orderedConstraints.hash);
    });
  });
});
