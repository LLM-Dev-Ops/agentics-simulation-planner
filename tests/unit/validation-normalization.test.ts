/**
 * Unit tests for validation and normalization module
 */

import { validateAndNormalize } from '../../src/modules/validation-normalization.js';
import { resolveConstraints } from '../../src/modules/constraint-resolution.js';
import { discoverIntegrations } from '../../src/modules/integration-discovery.js';
import { expandAgentsAndWorkflows } from '../../src/modules/agent-workflow-expansion.js';
import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { SchemaValidationError, SemanticValidationError } from '../../src/types/errors.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type { ExpandedAgentsAndWorkflows, ResolvedConstraints, StructuredIntent } from '../../src/types/index.js';

describe('Validation and Normalization Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-validation-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestConstraints(rawIntent: string): Promise<{
    intent: StructuredIntent;
    expanded: ExpandedAgentsAndWorkflows;
    resolved: ResolvedConstraints;
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
    const resolved = await resolveConstraints(intent, expanded, integrationMap, sessionId, adapter);
    return { intent, expanded, resolved };
  }

  describe('validateAndNormalize', () => {
    it('should validate and normalize expanded agents and constraints', async () => {
      const { expanded, resolved } = await createTestConstraints('Optimize operations');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.id).toBeDefined();
      expect(result.constraintsId).toBe(resolved.id);
      expect(result.expandedId).toBe(expanded.id);
    });

    it('should perform schema validation', async () => {
      const { expanded, resolved } = await createTestConstraints('Reduce costs');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.schemaValidation).toBeDefined();
      expect(typeof result.schemaValidation.valid).toBe('boolean');
      expect(result.schemaValidation.errors).toBeDefined();
      expect(result.schemaValidation.warnings).toBeDefined();
    });

    it('should perform semantic validation', async () => {
      const { expanded, resolved } = await createTestConstraints('Deploy agents');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.semanticValidation).toBeDefined();
      expect(typeof result.semanticValidation.consistent).toBe('boolean');
      expect(result.semanticValidation.issues).toBeDefined();
    });

    it('should normalize data structures', async () => {
      const { expanded, resolved } = await createTestConstraints('Implement automation');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.normalizedStructures).toBeDefined();
      expect(result.normalizedStructures.agents).toBeDefined();
      expect(result.normalizedStructures.workflows).toBeDefined();
      expect(result.normalizedStructures.dependencies).toBeDefined();
    });

    it('should sort agents by ID', async () => {
      const { expanded, resolved } = await createTestConstraints('Scale infrastructure');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const agents = result.normalizedStructures.agents;
      for (let i = 0; i < agents.length - 1; i++) {
        const current = agents[i]!;
        const next = agents[i + 1]!;
        expect(current.id <= next.id).toBe(true);
      }
    });

    it('should sort workflows by ID', async () => {
      const { expanded, resolved } = await createTestConstraints('Transform processes');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const workflows = result.normalizedStructures.workflows;
      for (let i = 0; i < workflows.length - 1; i++) {
        const current = workflows[i]!;
        const next = workflows[i + 1]!;
        expect(current.id <= next.id).toBe(true);
      }
    });

    it('should sort workflow steps by order', async () => {
      const { expanded, resolved } = await createTestConstraints('Improve efficiency');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      for (const workflow of result.normalizedStructures.workflows) {
        for (let i = 0; i < workflow.steps.length - 1; i++) {
          const current = workflow.steps[i]!;
          const next = workflow.steps[i + 1]!;
          expect(current.order <= next.order).toBe(true);
        }
      }
    });

    it('should sort agent capabilities', async () => {
      const { expanded, resolved } = await createTestConstraints('Automate workflow');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      for (const agent of result.normalizedStructures.agents) {
        const capabilities = [...agent.capabilities];
        const sorted = [...capabilities].sort();
        expect(capabilities).toEqual(sorted);
      }
    });

    it('should create validation report', async () => {
      const { expanded, resolved } = await createTestConstraints('Deploy platform');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.validationReport).toBeDefined();
      expect(result.validationReport.schemaValidation).toBeDefined();
      expect(result.validationReport.semanticValidation).toBeDefined();
      expect(result.validationReport.normalizationApplied).toBe(true);
      expect(result.validationReport.timestamp).toBeDefined();
      expect(result.validationReport.validatorVersion).toBeDefined();
    });

    it('should set validation status', async () => {
      const { expanded, resolved } = await createTestConstraints('Reduce costs');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      expect(result.validationStatus).toBe('VALID');
    });

    it('should store normalized plan in ruvvector', async () => {
      const { expanded, resolved } = await createTestConstraints('Implement solution');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const stored = await adapter.retrieve(`normalized:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relations to constraints and expanded', async () => {
      const { expanded, resolved } = await createTestConstraints('Optimize data');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'VALIDATED_FROM_CONSTRAINTS')).toBe(true);
      expect(relations.some(r => r.type === 'VALIDATED_FROM_EXPANDED')).toBe(true);
    });

    it('should append audit entry', async () => {
      const { expanded, resolved } = await createTestConstraints('Scale operations');
      await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'VALIDATION_NORMALIZATION')).toBe(true);
    });
  });

  describe('schema validation', () => {
    it('should validate agent required fields', async () => {
      const { expanded, resolved } = await createTestConstraints('Deploy agents');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      // All agents should have passed validation
      expect(result.schemaValidation.valid).toBe(true);
    });

    it('should validate workflow required fields', async () => {
      const { expanded, resolved } = await createTestConstraints('Transform business');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      // All workflows should have passed validation
      expect(result.schemaValidation.valid).toBe(true);
    });

    it('should validate UUID format', async () => {
      const { expanded, resolved } = await createTestConstraints('Validate data quality metrics');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      // All UUIDs should be valid
      for (const agent of result.normalizedStructures.agents) {
        expect(agent.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      }
    });
  });

  describe('semantic validation', () => {
    it('should detect invalid agent references in workflows', async () => {
      const { expanded, resolved } = await createTestConstraints('Improve processes');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      // Should be consistent (no invalid references)
      expect(result.semanticValidation.consistent).toBe(true);
    });

    it('should detect duplicate IDs', async () => {
      const { expanded, resolved } = await createTestConstraints('Deploy infrastructure');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      // Should be consistent (no duplicate IDs)
      expect(result.semanticValidation.consistent).toBe(true);
    });
  });

  describe('normalization', () => {
    it('should trim whitespace from names', async () => {
      const { expanded, resolved } = await createTestConstraints('Reduce costs');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      for (const agent of result.normalizedStructures.agents) {
        expect(agent.name).toBe(agent.name.trim());
      }
    });

    it('should sort dependencies deterministically', async () => {
      const { expanded, resolved } = await createTestConstraints('Scale systems');
      const result = await validateAndNormalize(expanded, resolved, sessionId, adapter);

      const deps = result.normalizedStructures.dependencies;
      for (let i = 0; i < deps.length - 1; i++) {
        const current = deps[i]!;
        const next = deps[i + 1]!;
        const currentKey = `${current.fromAgentId}-${current.toAgentId}`;
        const nextKey = `${next.fromAgentId}-${next.toAgentId}`;
        expect(currentKey <= nextKey).toBe(true);
      }
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
      const normalized1 = await validateAndNormalize(expanded1, resolved1, sessionId, adapter);

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-validation-seed',
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
      const normalized2 = await validateAndNormalize(expanded2, resolved2, newSessionId, adapter);

      expect(normalized1.normalizedStructures.agents.length).toBe(normalized2.normalizedStructures.agents.length);
      expect(normalized1.normalizedStructures.workflows.length).toBe(normalized2.normalizedStructures.workflows.length);
    });
  });
});
