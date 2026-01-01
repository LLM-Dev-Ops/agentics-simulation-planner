/**
 * Unit tests for agent and workflow expansion module
 */

import { expandAgentsAndWorkflows } from '../../src/modules/agent-workflow-expansion.js';
import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { ExpansionError } from '../../src/types/errors.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type { DecomposedIntent, OrganizationalTopologyModel, StructuredIntent } from '../../src/types/index.js';

describe('Agent and Workflow Expansion Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-expansion-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestTopology(rawIntent: string): Promise<{
    intent: StructuredIntent;
    decomposed: DecomposedIntent;
    topology: OrganizationalTopologyModel;
  }> {
    const input: IntentIngestionInput = {
      rawIntent,
      organizationalContext: createMinimalContext('Test Corp'),
      sessionId,
    };
    const intent = await ingestIntent(input, adapter);
    const decomposed = await decomposeIntent(intent, adapter);
    const topology = await extractTopology(decomposed, intent, adapter);
    return { intent, decomposed, topology };
  }

  describe('expandAgentsAndWorkflows', () => {
    it('should expand agents from archetype mappings', async () => {
      const { decomposed, topology } = await createTestTopology('Optimize operations');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      expect(result.id).toBeDefined();
      expect(result.agentSpecifications.length).toBeGreaterThan(0);
    });

    it('should create agent specifications with required fields', async () => {
      const { decomposed, topology } = await createTestTopology('Reduce costs');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const agent of result.agentSpecifications) {
        expect(agent.id).toBeDefined();
        expect(agent.name).toBeDefined();
        expect(agent.archetypeId).toBeDefined();
        expect(agent.teamId).toBeDefined();
        expect(agent.capabilities).toBeDefined();
        expect(agent.communicationEndpoints).toBeDefined();
        expect(agent.resourceRequirements).toBeDefined();
      }
    });

    it('should compute resource requirements for agents', async () => {
      const { decomposed, topology } = await createTestTopology('Deploy infrastructure');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const agent of result.agentSpecifications) {
        expect(agent.resourceRequirements.cpu).toBeGreaterThan(0);
        expect(agent.resourceRequirements.memory).toBeGreaterThan(0);
        expect(agent.resourceRequirements.storage).toBeGreaterThan(0);
      }
    });

    it('should create workflow definitions', async () => {
      const { decomposed, topology } = await createTestTopology('Implement automation');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      expect(result.workflowDefinitions.length).toBeGreaterThan(0);

      for (const workflow of result.workflowDefinitions) {
        expect(workflow.id).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(workflow.steps.length).toBeGreaterThan(0);
      }
    });

    it('should create workflow steps with proper structure', async () => {
      const { decomposed, topology } = await createTestTopology('Scale operations');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const workflow of result.workflowDefinitions) {
        for (const step of workflow.steps) {
          expect(step.id).toBeDefined();
          expect(step.order).toBeGreaterThanOrEqual(0);
          expect(step.objectiveId).toBeDefined();
          expect(step.assignedAgentId).toBeDefined();
          expect(step.inputs).toBeDefined();
          expect(step.outputs).toBeDefined();
        }
      }
    });

    it('should assign agents to workflow steps', async () => {
      const { decomposed, topology } = await createTestTopology('Transform processes');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      const agentIds = new Set(result.agentSpecifications.map(a => a.id));

      for (const workflow of result.workflowDefinitions) {
        for (const step of workflow.steps) {
          expect(agentIds.has(step.assignedAgentId)).toBe(true);
        }
      }
    });

    it('should build inter-agent dependency map', async () => {
      const { decomposed, topology } = await createTestTopology('Optimize workflow');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      expect(result.interAgentDependencies).toBeDefined();
      expect(result.interAgentDependencies.dependencies).toBeDefined();
    });

    it('should validate agent capabilities', async () => {
      const { decomposed, topology } = await createTestTopology('Improve efficiency');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      expect(result.capabilityValidation).toBeDefined();
      expect(typeof result.capabilityValidation.valid).toBe('boolean');
      expect(result.capabilityValidation.issues).toBeDefined();
    });

    it('should store expanded result in ruvvector', async () => {
      const { decomposed, topology } = await createTestTopology('Deploy agents');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      const stored = await adapter.retrieve(`expanded:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relations to topology and decomposed', async () => {
      const { decomposed, topology } = await createTestTopology('Automate reporting');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'EXPANDED_FROM_TOPOLOGY')).toBe(true);
      expect(relations.some(r => r.type === 'EXPANDED_FROM_DECOMPOSED')).toBe(true);
    });

    it('should append audit entry', async () => {
      const { decomposed, topology } = await createTestTopology('Implement solution');
      await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'AGENT_WORKFLOW_EXPANSION')).toBe(true);
    });
  });

  describe('parallelization strategy', () => {
    it('should determine parallelization strategy for workflows', async () => {
      const { decomposed, topology } = await createTestTopology('Reduce costs');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const workflow of result.workflowDefinitions) {
        expect(['NONE', 'STEP_LEVEL', 'ADAPTIVE']).toContain(workflow.parallelizationStrategy);
      }
    });
  });

  describe('capability matching', () => {
    it('should match agent capabilities to objectives', async () => {
      const { decomposed, topology } = await createTestTopology('Analyze data patterns');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const agent of result.agentSpecifications) {
        // Agent should have assigned objectives array
        expect(agent.assignedObjectives).toBeDefined();
        expect(Array.isArray(agent.assignedObjectives)).toBe(true);
      }
    });
  });

  describe('workflow step inputs/outputs', () => {
    it('should chain step outputs to subsequent step inputs', async () => {
      const { decomposed, topology } = await createTestTopology('Transform business');
      const result = await expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);

      for (const workflow of result.workflowDefinitions) {
        for (let i = 1; i < workflow.steps.length; i++) {
          const step = workflow.steps[i]!;
          // Non-first steps should have inputs
          expect(step.inputs.length).toBeGreaterThan(0);
        }
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

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-expansion-seed',
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

      expect(expanded1.agentSpecifications.length).toBe(expanded2.agentSpecifications.length);
      expect(expanded1.workflowDefinitions.length).toBe(expanded2.workflowDefinitions.length);
    });
  });
});
