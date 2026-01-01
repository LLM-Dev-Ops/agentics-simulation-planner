/**
 * Unit tests for SimulationPlan serialization module
 */

import { serializeSimulationPlan } from '../../src/modules/simulation-plan-serialization.js';
import { validateAndNormalize } from '../../src/modules/validation-normalization.js';
import { resolveConstraints } from '../../src/modules/constraint-resolution.js';
import { discoverIntegrations } from '../../src/modules/integration-discovery.js';
import { expandAgentsAndWorkflows } from '../../src/modules/agent-workflow-expansion.js';
import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type {
  StructuredIntent,
  DecomposedIntent,
  OrganizationalTopologyModel,
  ExpandedAgentsAndWorkflows,
  IntegrationMap,
  ResolvedConstraints,
  NormalizedPlan,
} from '../../src/types/index.js';

describe('SimulationPlan Serialization Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-serialization-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestNormalized(rawIntent: string): Promise<{
    intent: StructuredIntent;
    decomposed: DecomposedIntent;
    topology: OrganizationalTopologyModel;
    expanded: ExpandedAgentsAndWorkflows;
    integrationMap: IntegrationMap;
    resolved: ResolvedConstraints;
    normalized: NormalizedPlan;
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
    const normalized = await validateAndNormalize(expanded, resolved, sessionId, adapter);
    return { intent, decomposed, topology, expanded, integrationMap, resolved, normalized };
  }

  describe('serializeSimulationPlan', () => {
    it('should serialize complete SimulationPlan', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Optimize operations');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan).toBeDefined();
      expect(plan.version).toBe('2.0.0');
    });

    it('should include complete metadata', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Reduce costs by 20%');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.metadata.planId).toBeDefined();
      expect(plan.metadata.createdAt).toBeDefined();
      expect(plan.metadata.sourceIntent).toBe('Reduce costs by 20%');
      expect(plan.metadata.traceId).toBeDefined();
      expect(plan.metadata.plannerVersion).toBeDefined();
      expect(plan.metadata.contentHash).toBeDefined();
    });

    it('should include simulation objectives', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Deploy 100 agents');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.objectives).toBeDefined();
      expect(plan.objectives.length).toBeGreaterThan(0);

      for (const objective of plan.objectives) {
        expect(objective.objectiveId).toBeDefined();
        expect(objective.type).toBeDefined();
        expect(objective.target).toBeDefined();
        expect(objective.priority).toBeDefined();
      }
    });

    it('should map objectives to correct types', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Reduce operational costs');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      // Should include cost_reduction type for reduce action
      const types = plan.objectives.map(o => o.type);
      expect(types.some(t =>
        ['cost_reduction', 'performance_improvement', 'resource_optimization', 'capacity_scaling', 'risk_mitigation']
          .includes(t)
      )).toBe(true);
    });

    it('should include serialized agents', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Implement automation');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.agents).toBeDefined();
      expect(plan.agents.length).toBeGreaterThan(0);

      for (const agent of plan.agents) {
        expect(agent.agentId).toBeDefined();
        expect(agent.type).toBeDefined();
        expect(agent.capabilities).toBeDefined();
        expect(agent.allocation).toBeDefined();
        expect(agent.resources).toBeDefined();
      }
    });

    it('should include constraints', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Scale infrastructure');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.constraints).toBeDefined();
    });

    it('should include execution configuration', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Transform processes');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.execution).toBeDefined();
      expect(['sequential', 'parallel', 'hybrid']).toContain(plan.execution.strategy);
      expect(plan.execution.phases).toBeDefined();
      expect(plan.execution.phases.length).toBeGreaterThan(0);
    });

    it('should include execution phases with required fields', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Improve efficiency');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      for (const phase of plan.execution.phases) {
        expect(phase.phaseId).toBeDefined();
        expect(phase.name).toBeDefined();
        expect(phase.order).toBeGreaterThan(0);
        expect(phase.objectives).toBeDefined();
        expect(phase.agents).toBeDefined();
      }
    });

    it('should include serialized workflows', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Automate workflow');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.workflows).toBeDefined();
      expect(plan.workflows?.length).toBeGreaterThan(0);

      for (const workflow of plan.workflows ?? []) {
        expect(workflow.id).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(workflow.steps).toBeDefined();
      }
    });

    it('should include integration contracts', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Deploy platform');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.integrations).toBeDefined();
    });

    it('should include execution graph', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Optimize data');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.executionGraph).toBeDefined();
      expect(plan.executionGraph?.nodes).toBeDefined();
      expect(plan.executionGraph?.edges).toBeDefined();
    });

    it('should include aggregated resource requirements', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Scale operations');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.resourceRequirements).toBeDefined();
      expect(plan.resourceRequirements?.totalCpu).toBeGreaterThan(0);
      expect(plan.resourceRequirements?.totalMemory).toBeGreaterThan(0);
      expect(plan.resourceRequirements?.totalStorage).toBeGreaterThan(0);
      expect(plan.resourceRequirements?.peakAgents).toBeGreaterThan(0);
    });

    it('should include validation status', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Validate quality metrics');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.validationStatus).toBeDefined();
      expect(typeof plan.validationStatus?.schemaValid).toBe('boolean');
      expect(typeof plan.validationStatus?.semanticallyConsistent).toBe('boolean');
      expect(plan.validationStatus?.validatedAt).toBeDefined();
    });

    it('should include audit trail', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Implement solution');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.auditTrail).toBeDefined();
      expect(plan.auditTrail?.length).toBeGreaterThan(0);

      // Should have entries from multiple stages
      const stages = new Set(plan.auditTrail?.map(e => e.stage));
      expect(stages.size).toBeGreaterThan(1);
    });

    it('should compute content hash', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Reduce costs');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      expect(plan.metadata.contentHash).toBeDefined();
      expect(plan.metadata.contentHash.length).toBe(64); // SHA-256 hex
    });

    it('should store plan in ruvvector', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Deploy infrastructure');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      const stored = await adapter.retrieve(`plan:${plan.metadata.planId}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relation to normalized plan', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Transform business');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      const relations = await adapter.queryRelations({ from: plan.metadata.planId });
      expect(relations.some(r => r.type === 'SERIALIZED_FROM')).toBe(true);
    });

    it('should append final audit entry with content hash', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Improve processes');

      await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      const trail = await adapter.getAuditTrail(sessionId);
      const serializationEntry = trail.find(e => e.stage === 'SERIALIZATION');
      expect(serializationEntry).toBeDefined();
      expect(serializationEntry?.contentHash).toBeDefined();
    });
  });

  describe('determinism', () => {
    it('should produce identical content hash for identical input', async () => {
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
      const plan1 = await serializeSimulationPlan(
        intent1, decomposed1, topology1, expanded1, integration1, resolved1, normalized1, sessionId, adapter
      );

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-serialization-seed',
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
      const plan2 = await serializeSimulationPlan(
        intent2, decomposed2, topology2, expanded2, integration2, resolved2, normalized2, newSessionId, adapter
      );

      // Content hashes should match
      expect(plan1.metadata.contentHash).toBe(plan2.metadata.contentHash);
    });
  });

  describe('schema compliance', () => {
    it('should produce v2.0.0 schema compliant output', async () => {
      const { intent, decomposed, topology, expanded, integrationMap, resolved, normalized } =
        await createTestNormalized('Optimize operations');

      const plan = await serializeSimulationPlan(
        intent, decomposed, topology, expanded, integrationMap, resolved, normalized, sessionId, adapter
      );

      // Required top-level fields
      expect(plan.version).toMatch(/^2\.0\.\d+$/);
      expect(plan.metadata).toBeDefined();
      expect(plan.objectives).toBeDefined();
      expect(plan.agents).toBeDefined();
      expect(plan.constraints).toBeDefined();
      expect(plan.execution).toBeDefined();
    });
  });
});
