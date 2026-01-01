/**
 * Unit tests for the main planner
 */

import {
  planSimulation,
  verifyDeterminism,
  createMinimalContext,
  type PlanningInput,
} from '../../src/core/planner.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { ValidationError } from '../../src/types/errors.js';

describe('Planner', () => {
  let adapter: InMemoryRuvvectorAdapter;

  beforeEach(() => {
    adapter = new InMemoryRuvvectorAdapter();
  });

  afterEach(() => {
    adapter.clear();
  });

  describe('createMinimalContext', () => {
    it('should create valid organizational context', () => {
      const context = createMinimalContext('Test Organization');

      expect(context.organizationId).toBeDefined();
      expect(context.organizationName).toBe('Test Organization');
      expect(context.topology.divisions.length).toBeGreaterThan(0);
      expect(context.topology.teams.length).toBeGreaterThan(0);
    });

    it('should use provided organization ID', () => {
      const context = createMinimalContext('Test Org', 'custom-org-id');
      expect(context.organizationId).toBe('custom-org-id');
    });
  });

  describe('planSimulation', () => {
    it('should generate a SimulationPlan from natural language intent', async () => {
      const input: PlanningInput = {
        intent: 'Reduce operational costs by 20% in Q3',
        context: createMinimalContext('Test Corporation'),
        adapter,
      };

      const result = await planSimulation(input);

      expect(result.plan).toBeDefined();
      expect(result.plan.version).toBe('2.0.0');
      expect(result.plan.metadata.planId).toBeDefined();
      expect(result.plan.metadata.sourceIntent).toBe(input.intent);
      expect(result.plan.objectives.length).toBeGreaterThan(0);
      expect(result.plan.agents.length).toBeGreaterThan(0);
      expect(result.plan.execution.strategy).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should produce deterministic output for same input and seed', async () => {
      const input: PlanningInput = {
        intent: 'Deploy 100 agents across regional offices',
        context: createMinimalContext('Test Corp'),
        adapter,
      };

      const seed = 'deterministic-seed-123';

      const result1 = await planSimulation(input, { seed });

      adapter.clear();

      const result2 = await planSimulation(input, { seed });

      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should throw ValidationError for empty intent', async () => {
      const input: PlanningInput = {
        intent: '',
        context: createMinimalContext('Test Corp'),
        adapter,
      };

      await expect(planSimulation(input)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing context', async () => {
      const input = {
        intent: 'Reduce costs',
        context: null as unknown as ReturnType<typeof createMinimalContext>,
        adapter,
      };

      await expect(planSimulation(input)).rejects.toThrow();
    });

    it('should handle complex multi-objective intents', async () => {
      const input: PlanningInput = {
        intent: 'Optimize supply chain logistics while reducing costs by 15% and improving delivery times across APAC region',
        context: createMinimalContext('Global Logistics Inc'),
        adapter,
      };

      const result = await planSimulation(input);

      expect(result.plan.objectives.length).toBeGreaterThan(0);
      expect(result.plan.workflows?.length).toBeGreaterThan(0);
    });

    it('should include audit trail in output', async () => {
      const input: PlanningInput = {
        intent: 'Implement automation for invoice processing',
        context: createMinimalContext('Finance Corp'),
        adapter,
      };

      const result = await planSimulation(input);

      expect(result.plan.auditTrail).toBeDefined();
      expect(result.plan.auditTrail?.length).toBeGreaterThan(0);

      // Verify audit trail has entries for each stage
      const stages = new Set(result.plan.auditTrail?.map(e => e.stage));
      expect(stages.has('INTENT_INGESTION')).toBe(true);
      expect(stages.has('SERIALIZATION')).toBe(true);
    });

    it('should generate valid execution configuration', async () => {
      const input: PlanningInput = {
        intent: 'Scale customer service operations to handle 10000 daily inquiries',
        context: createMinimalContext('Service Corp'),
        adapter,
      };

      const result = await planSimulation(input);

      expect(['sequential', 'parallel', 'hybrid']).toContain(result.plan.execution.strategy);
      expect(result.plan.execution.phases.length).toBeGreaterThan(0);

      for (const phase of result.plan.execution.phases) {
        expect(phase.phaseId).toBeDefined();
        expect(phase.name).toBeDefined();
        expect(phase.order).toBeGreaterThan(0);
      }
    });
  });

  describe('verifyDeterminism', () => {
    it('should verify deterministic output matches expected hash', async () => {
      const input: PlanningInput = {
        intent: 'Reduce costs by 10%',
        context: createMinimalContext('Test Corp'),
        adapter,
      };

      const seed = 'verify-seed';
      const result = await planSimulation(input, { seed });

      adapter.clear();

      const isVerified = await verifyDeterminism(input, result.contentHash, seed);
      expect(isVerified).toBe(true);
    });

    it('should return false for non-matching hash', async () => {
      const input: PlanningInput = {
        intent: 'Reduce costs by 10%',
        context: createMinimalContext('Test Corp'),
        adapter,
      };

      const seed = 'verify-seed';
      const wrongHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';

      const isVerified = await verifyDeterminism(input, wrongHash, seed);
      expect(isVerified).toBe(false);
    });
  });

  describe('SimulationPlan schema compliance', () => {
    it('should produce plan with all required fields', async () => {
      const input: PlanningInput = {
        intent: 'Optimize operations',
        context: createMinimalContext('Test Corp'),
        adapter,
      };

      const result = await planSimulation(input);
      const plan = result.plan;

      // Required top-level fields per schema
      expect(plan.version).toMatch(/^2\.0\.\d+$/);
      expect(plan.metadata).toBeDefined();
      expect(plan.objectives).toBeDefined();
      expect(plan.agents).toBeDefined();
      expect(plan.constraints).toBeDefined();
      expect(plan.execution).toBeDefined();

      // Required metadata fields
      expect(plan.metadata.planId).toBeDefined();
      expect(plan.metadata.createdAt).toBeDefined();
      expect(plan.metadata.sourceIntent).toBeDefined();
      expect(plan.metadata.traceId).toBeDefined();

      // Objectives array
      expect(Array.isArray(plan.objectives)).toBe(true);
      expect(plan.objectives.length).toBeGreaterThan(0);

      for (const objective of plan.objectives) {
        expect(objective.objectiveId).toBeDefined();
        expect(objective.type).toBeDefined();
        expect(objective.target).toBeDefined();
        expect(objective.priority).toBeDefined();
      }

      // Agents array
      expect(Array.isArray(plan.agents)).toBe(true);

      for (const agent of plan.agents) {
        expect(agent.agentId).toBeDefined();
        expect(agent.type).toBeDefined();
        expect(agent.capabilities).toBeDefined();
        expect(agent.allocation).toBeDefined();
      }

      // Execution config
      expect(['sequential', 'parallel', 'hybrid']).toContain(plan.execution.strategy);
      expect(Array.isArray(plan.execution.phases)).toBe(true);
    });
  });
});
