/**
 * Tests for SimulationPlanBuilder
 *
 * These tests verify that the builder correctly constructs simulation plans
 * targeting the agentics-simulation-runner, with proper ERP surface dependencies,
 * policy inputs, and output artifact specifications.
 */

import {
  SimulationPlanBuilder,
  createSimulationPlanBuilder,
  extendSimulationPlan,
} from '../../src/core/simulation-plan-builder.js';
import type { SimulationScope } from '../../src/types/simulation-scope.js';
import type { PolicyInput } from '../../src/types/policy-input.js';
import type { OutputArtifactSpec } from '../../src/types/output-artifact.js';
import type { ERPSurfaceReference, ERPIntegrationRequirement } from '../../src/types/erp-surface.js';
import type { SimulationObjective, ExecutionConfig, SimulationConstraints } from '../../src/types/simulation-plan.js';
import { generateDeterministicId } from '../../src/utils/crypto.js';

describe('SimulationPlanBuilder', () => {
  // Helper function to create a valid scope
  const createValidScope = (): SimulationScope => ({
    targetEngine: 'agentics-simulation-runner',
    engineVersion: '>=1.0.0',
    scopeType: 'FULL',
    includedDomains: ['FINANCE', 'SUPPLY_CHAIN'],
    excludedCapabilities: [],
    timeHorizon: {
      start: '2024-01-01T00:00:00Z',
      end: '2024-12-31T23:59:59Z',
      granularity: 'DAY',
    },
    dataVolumeBounds: {
      minRecords: 1000,
      maxRecords: 100000,
    },
  });

  // Helper function to create a valid objective
  const createValidObjective = (id?: string): SimulationObjective => ({
    objectiveId: id ?? generateDeterministicId('obj', 'test'),
    type: 'cost_reduction',
    target: {
      metric: 'operational_cost',
      value: 15,
      unit: 'percent',
    },
    priority: 1,
    description: 'Reduce operational costs by 15%',
  });

  // Helper function to create valid execution config
  const createValidExecution = (): ExecutionConfig => ({
    strategy: 'parallel',
    phases: [
      {
        phaseId: generateDeterministicId('phase', 'test', '1'),
        name: 'Analysis Phase',
        order: 1,
        objectives: [],
        agents: [],
      },
    ],
  });

  describe('create()', () => {
    it('should create a new builder instance', () => {
      const builder = SimulationPlanBuilder.create();
      expect(builder).toBeInstanceOf(SimulationPlanBuilder);
    });

    it('should accept options', () => {
      const builder = SimulationPlanBuilder.create({
        seed: 'test-seed',
        plannerVersion: '2.0.0',
      });
      expect(builder).toBeInstanceOf(SimulationPlanBuilder);
    });
  });

  describe('withTargetEngine()', () => {
    it('should set the target engine to agentics-simulation-runner', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.targetEngine?.engine).toBe('agentics-simulation-runner');
      expect(result.plan?.targetEngine?.versionConstraint).toBe('>=1.0.0');
    });

    it('should include required capabilities when specified', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '^1.0.0', ['multi-agent', 'erp-integration'])
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.targetEngine?.requiredCapabilities).toEqual(['multi-agent', 'erp-integration']);
    });

    // ADR-0001: the pre-retarget engine literal is gone from the type system, so a
    // scope still carrying it no longer agrees with the plan's target engine.
    it('should reject a scope still targeting the pre-retarget engine', () => {
      const legacyScope = {
        ...createValidScope(),
        targetEngine: 'agentics-simulation-engine',
      } as unknown as SimulationScope;

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(legacyScope)
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(false);
      expect(
        result.errors.some(e => e.includes('does not match'))
      ).toBe(true);
    });
  });

  describe('withScope()', () => {
    it('should set simulation scope and validate it', () => {
      const scope = createValidScope();
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(scope)
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.scope).toEqual(scope);
      expect(result.plan?.scopeValidation?.valid).toBe(true);
    });

    it('should estimate scope complexity', () => {
      const highComplexityScope: SimulationScope = {
        ...createValidScope(),
        includedDomains: ['FINANCE', 'SUPPLY_CHAIN', 'HUMAN_RESOURCES', 'OPERATIONS', 'CUSTOMER_RELATIONSHIP'],
        dataVolumeBounds: { minRecords: 100000, maxRecords: 10000000 },
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(highComplexityScope)
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(['HIGH', 'VERY_HIGH']).toContain(result.plan?.scopeValidation?.estimatedComplexity);
    });

    it('should generate a scope hash', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.scopeValidation?.scopeHash).toBeDefined();
      expect(result.plan?.scopeValidation?.scopeHash.length).toBe(64); // SHA256 hex length
    });
  });

  describe('withERPSurface()', () => {
    it('should add ERP surface dependencies', () => {
      const erpSurface: ERPSurfaceReference = {
        surfaceId: generateDeterministicId('surface', 'finance'),
        domain: 'FINANCE',
        capabilities: [
          {
            capability: 'accounts_payable',
            domain: 'FINANCE',
            priority: 'HIGH',
            reason: 'Track vendor payments',
          },
        ],
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .withERPSurface(erpSurface)
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.erpSurfaces).toHaveLength(1);
      expect(result.plan?.erpSurfaces?.[0].domain).toBe('FINANCE');
    });

    it('should warn when ERP surface domain is not in scope', () => {
      const erpSurface: ERPSurfaceReference = {
        surfaceId: generateDeterministicId('surface', 'hr'),
        domain: 'HUMAN_RESOURCES', // Not in the default scope
        capabilities: [],
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope()) // Only includes FINANCE and SUPPLY_CHAIN
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .withERPSurface(erpSurface)
        .build();

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.includes('HUMAN_RESOURCES'))).toBe(true);
    });
  });

  describe('withPolicy()', () => {
    it('should add policy inputs', () => {
      const policy: PolicyInput = {
        id: generateDeterministicId('policy', 'resource'),
        name: 'Resource Allocation Policy',
        version: '1.0.0',
        effectiveFrom: '2024-01-01T00:00:00Z',
        effectiveUntil: null,
        policyType: 'RESOURCE_ALLOCATION',
        specification: {
          maxAgents: 10,
          maxConcurrentWorkflows: 5,
          cpuLimit: 4000,
          memoryLimit: 8192,
        },
        priority: 'HIGH',
        enforcementLevel: 'STRICT',
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .withPolicy(policy)
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.policies?.policies).toHaveLength(1);
      expect(result.plan?.policies?.policies[0].policyType).toBe('RESOURCE_ALLOCATION');
    });

    it('should warn about duplicate policy types', () => {
      const policy1: PolicyInput = {
        id: generateDeterministicId('policy', '1'),
        name: 'Resource Policy 1',
        version: '1.0.0',
        effectiveFrom: '2024-01-01T00:00:00Z',
        effectiveUntil: null,
        policyType: 'RESOURCE_ALLOCATION',
        specification: { maxAgents: 10, maxConcurrentWorkflows: 5, cpuLimit: 4000, memoryLimit: 8192 },
        priority: 'HIGH',
        enforcementLevel: 'STRICT',
      };

      const policy2: PolicyInput = {
        ...policy1,
        id: generateDeterministicId('policy', '2'),
        name: 'Resource Policy 2',
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .withPolicies([policy1, policy2])
        .build();

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.includes('RESOURCE_ALLOCATION'))).toBe(true);
    });
  });

  describe('withOutputArtifact()', () => {
    it('should add output artifact specifications', () => {
      const artifact: OutputArtifactSpec = {
        id: generateDeterministicId('artifact', 'results'),
        name: 'simulation-results',
        artifactType: 'SIMULATION_RESULTS',
        format: 'JSON',
        schema: {
          schemaType: 'JSON_SCHEMA',
          schemaVersion: '1.0.0',
          schemaUri: 'https://schemas.example.com/results.json',
          inlineSchema: null,
        },
        destination: {
          destinationType: 'OBJECT_STORAGE',
          uri: 's3://simulation-outputs/results/',
          credentials: 'IAM',
          partitioning: null,
        },
        lifecycle: {
          retentionDays: 365,
          archiveAfterDays: 90,
          immutable: true,
          versioned: true,
        },
        consumers: [
          {
            consumerId: 'analytics-dashboard',
            consumerType: 'DASHBOARD',
            requiredFields: ['totalCost', 'savings'],
            refreshFrequency: 'BATCH_HOURLY',
          },
        ],
      };

      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .withOutputArtifact(artifact)
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.outputArtifacts?.artifacts).toHaveLength(1);
      expect(result.plan?.outputArtifacts?.artifacts[0].artifactType).toBe('SIMULATION_RESULTS');
    });
  });

  describe('build()', () => {
    it('should fail without target engine', () => {
      const result = SimulationPlanBuilder.create()
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Target engine'))).toBe(true);
    });

    it('should fail without scope', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('scope'))).toBe(true);
    });

    it('should fail without objectives', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('objective'))).toBe(true);
    });

    it('should fail without execution config', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .build();

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Execution'))).toBe(true);
    });

    it('should warn without constraints', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.warnings.some(w => w.includes('constraint'))).toBe(true);
    });

    it('should generate a content hash', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.metadata.contentHash).toBeDefined();
      expect(result.plan?.metadata.contentHash?.length).toBe(64);
    });

    it('should set schema version to 2.1.0', () => {
      const result = SimulationPlanBuilder.create()
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
        .withScope(createValidScope())
        .withObjective(createValidObjective())
        .withExecution(createValidExecution())
        .build();

      expect(result.success).toBe(true);
      expect(result.plan?.version).toBe('2.1.0');
    });
  });

  describe('immutability', () => {
    it('should return new builder instances (immutable pattern)', () => {
      const builder1 = SimulationPlanBuilder.create();
      const builder2 = builder1.withTargetEngine('agentics-simulation-runner', '>=1.0.0');
      const builder3 = builder2.withScope(createValidScope());

      expect(builder1).not.toBe(builder2);
      expect(builder2).not.toBe(builder3);
    });
  });

  describe('extendSimulationPlan()', () => {
    it('should create a builder from an existing partial plan', () => {
      const partialPlan = {
        targetEngine: {
          engine: 'agentics-simulation-runner' as const,
          versionConstraint: '>=1.0.0',
        },
        objectives: [createValidObjective()],
      };

      const builder = extendSimulationPlan(partialPlan);
      expect(builder).toBeInstanceOf(SimulationPlanBuilder);
    });
  });

  describe('full plan construction', () => {
    it('should build a complete simulation plan with all features', () => {
      const result = SimulationPlanBuilder.create({ seed: 'deterministic-test' })
        .withTargetEngine('agentics-simulation-runner', '>=1.0.0', ['multi-agent'])
        .withScope({
          targetEngine: 'agentics-simulation-runner',
          engineVersion: '>=1.0.0',
          scopeType: 'PARTIAL',
          includedDomains: ['FINANCE', 'SUPPLY_CHAIN'],
          excludedCapabilities: ['tax_management'],
          timeHorizon: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-06-30T23:59:59Z',
            granularity: 'WEEK',
          },
          dataVolumeBounds: { minRecords: 5000, maxRecords: 50000 },
        })
        .withSourceIntent('Optimize supply chain costs by 20%')
        .withObjective({
          objectiveId: generateDeterministicId('obj', 'cost'),
          type: 'cost_reduction',
          target: { metric: 'supply_chain_cost', value: 20, unit: 'percent' },
          priority: 1,
          description: 'Reduce supply chain costs',
        })
        .withConstraints({
          temporal: { maxDuration: 720 },
          resource: { maxAgents: 5, maxConcurrency: 3 },
        })
        .withExecution({
          strategy: 'hybrid',
          phases: [
            {
              phaseId: generateDeterministicId('phase', 'analysis'),
              name: 'Analysis',
              order: 1,
              objectives: [],
              agents: [],
            },
            {
              phaseId: generateDeterministicId('phase', 'optimization'),
              name: 'Optimization',
              order: 2,
              objectives: [],
              agents: [],
              dependencies: [generateDeterministicId('phase', 'analysis')],
            },
          ],
          rollbackPolicy: 'automatic',
        })
        .withERPSurface({
          surfaceId: generateDeterministicId('surface', 'finance'),
          domain: 'FINANCE',
          capabilities: [
            { capability: 'accounts_payable', domain: 'FINANCE', priority: 'HIGH' },
          ],
        })
        .withERPSurface({
          surfaceId: generateDeterministicId('surface', 'supply'),
          domain: 'SUPPLY_CHAIN',
          capabilities: [
            { capability: 'inventory_management', domain: 'SUPPLY_CHAIN', priority: 'HIGH' },
          ],
        })
        .withPolicy({
          id: generateDeterministicId('policy', 'compliance'),
          name: 'SOC2 Compliance',
          version: '1.0.0',
          effectiveFrom: '2024-01-01T00:00:00Z',
          effectiveUntil: null,
          policyType: 'COMPLIANCE',
          specification: {
            requiredFrameworks: ['SOC2'],
            dataRetentionDays: 365,
            auditLevel: 'COMPREHENSIVE',
            piiHandling: 'MASK',
          },
          priority: 'CRITICAL',
          enforcementLevel: 'STRICT',
        })
        .withOutputArtifact({
          id: generateDeterministicId('artifact', 'results'),
          name: 'simulation-results',
          artifactType: 'SIMULATION_RESULTS',
          format: 'JSON',
          schema: {
            schemaType: 'JSON_SCHEMA',
            schemaVersion: '1.0.0',
            schemaUri: null,
            inlineSchema: { type: 'object' },
          },
          destination: {
            destinationType: 'OBJECT_STORAGE',
            uri: 's3://outputs/results/',
            credentials: 'IAM',
            partitioning: { type: 'TIME_BASED', keyField: 'date', partitionCount: null },
          },
          lifecycle: {
            retentionDays: 365,
            archiveAfterDays: 90,
            immutable: true,
            versioned: true,
          },
          consumers: [],
        })
        .withOutputArtifact({
          id: generateDeterministicId('artifact', 'audit'),
          name: 'audit-log',
          artifactType: 'AUDIT_LOG',
          format: 'JSON',
          schema: {
            schemaType: 'JSON_SCHEMA',
            schemaVersion: '1.0.0',
            schemaUri: null,
            inlineSchema: null,
          },
          destination: {
            destinationType: 'OBJECT_STORAGE',
            uri: 's3://outputs/audit/',
            credentials: 'IAM',
            partitioning: null,
          },
          lifecycle: {
            retentionDays: 2555, // 7 years for compliance
            archiveAfterDays: 365,
            immutable: true,
            versioned: false,
          },
          consumers: [
            {
              consumerId: 'compliance-team',
              consumerType: 'HUMAN',
              requiredFields: ['action', 'timestamp', 'actor'],
              refreshFrequency: 'ON_DEMAND',
            },
          ],
        })
        .build();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      const plan = result.plan!;

      // Verify structure
      expect(plan.version).toBe('2.1.0');
      expect(plan.targetEngine?.engine).toBe('agentics-simulation-runner');
      expect(plan.scope?.scopeType).toBe('PARTIAL');
      expect(plan.scope?.includedDomains).toContain('FINANCE');
      expect(plan.objectives).toHaveLength(1);
      expect(plan.constraints.temporal?.maxDuration).toBe(720);
      expect(plan.execution.strategy).toBe('hybrid');
      expect(plan.execution.phases).toHaveLength(2);
      expect(plan.erpSurfaces).toHaveLength(2);
      expect(plan.policies?.policies).toHaveLength(1);
      expect(plan.outputArtifacts?.artifacts).toHaveLength(2);
      expect(plan.outputArtifacts?.generationOrder).toHaveLength(2);
      expect(plan.metadata.contentHash).toBeDefined();
      expect(plan.metadata.sourceIntent).toBe('Optimize supply chain costs by 20%');
    });
  });
});
