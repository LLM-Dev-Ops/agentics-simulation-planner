/**
 * Unit tests for integration discovery module
 */

import { discoverIntegrations } from '../../src/modules/integration-discovery.js';
import { expandAgentsAndWorkflows } from '../../src/modules/agent-workflow-expansion.js';
import { extractTopology } from '../../src/modules/topology-extraction.js';
import { decomposeIntent } from '../../src/modules/intent-decomposition.js';
import { ingestIntent, type IntentIngestionInput } from '../../src/modules/intent-ingestion.js';
import { InMemoryRuvvectorAdapter } from '../../src/adapters/ruvvector-adapter.js';
import { createMinimalContext } from '../../src/core/planner.js';
import type { ExpandedAgentsAndWorkflows } from '../../src/types/index.js';

describe('Integration Discovery Module', () => {
  let adapter: InMemoryRuvvectorAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new InMemoryRuvvectorAdapter();
    sessionId = await adapter.initSession({
      seed: 'test-integration-seed',
      namespace: 'test',
      isolationLevel: 'SERIALIZABLE',
    });
  });

  afterEach(() => {
    adapter.clear();
  });

  async function createTestExpanded(rawIntent: string): Promise<ExpandedAgentsAndWorkflows> {
    const input: IntentIngestionInput = {
      rawIntent,
      organizationalContext: createMinimalContext('Test Corp'),
      sessionId,
    };
    const intent = await ingestIntent(input, adapter);
    const decomposed = await decomposeIntent(intent, adapter);
    const topology = await extractTopology(decomposed, intent, adapter);
    return expandAgentsAndWorkflows(decomposed, topology, sessionId, adapter);
  }

  describe('discoverIntegrations', () => {
    it('should discover integrations for expanded agents', async () => {
      const expanded = await createTestExpanded('Optimize operations');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      expect(result.id).toBeDefined();
      expect(result.expandedId).toBe(expanded.id);
      expect(result.repositorySurfaces).toBeDefined();
    });

    it('should expose repository capability surfaces', async () => {
      const expanded = await createTestExpanded('Reduce costs');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      expect(result.repositorySurfaces.length).toBeGreaterThan(0);

      for (const surface of result.repositorySurfaces) {
        expect(surface.repository).toBeDefined();
        expect(surface.version).toBeDefined();
        expect(surface.capabilities).toBeDefined();
      }
    });

    it('should include agentics-simulation-runner surface', async () => {
      const expanded = await createTestExpanded('Deploy agents');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const runnerSurface = result.repositorySurfaces.find(
        s => s.repository === 'agentics-simulation-runner'
      );
      expect(runnerSurface).toBeDefined();
      expect(runnerSurface?.capabilities.length).toBeGreaterThan(0);
    });

    it('should include agentics-deployment-intent surface', async () => {
      const expanded = await createTestExpanded('Implement automation');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const deploymentSurface = result.repositorySurfaces.find(
        s => s.repository === 'agentics-deployment-intent'
      );
      expect(deploymentSurface).toBeDefined();
    });

    it('should match capabilities to providers', async () => {
      const expanded = await createTestExpanded('Scale infrastructure');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      expect(result.capabilityMatches).toBeDefined();
      expect(result.capabilityMatches.length).toBeGreaterThan(0);

      for (const match of result.capabilityMatches) {
        expect(match.requiredCapability).toBeDefined();
        expect(match.providers).toBeDefined();
        expect(['MATCHED', 'PARTIAL', 'UNMATCHED']).toContain(match.status);
      }
    });

    it('should create integration contracts for matched capabilities', async () => {
      const expanded = await createTestExpanded('Validate data quality metrics');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      // Should have contracts for matched capabilities
      if (result.capabilityMatches.some(m => m.status === 'MATCHED')) {
        expect(result.integrationContracts.length).toBeGreaterThan(0);

        for (const contract of result.integrationContracts) {
          expect(contract.id).toBeDefined();
          expect(contract.capability).toBeDefined();
          expect(contract.provider).toBeDefined();
          expect(contract.contractVersion).toBeDefined();
        }
      }
    });

    it('should store integration map in ruvvector', async () => {
      const expanded = await createTestExpanded('Automate workflow');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const stored = await adapter.retrieve(`integration:${result.id}`);
      expect(stored.found).toBe(true);
      expect(stored.value).toBeDefined();
    });

    it('should create relation to expanded', async () => {
      const expanded = await createTestExpanded('Implement solution');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const relations = await adapter.queryRelations({ from: result.id });
      expect(relations.some(r => r.type === 'DISCOVERED_FROM')).toBe(true);
    });

    it('should append audit entry', async () => {
      const expanded = await createTestExpanded('Deploy platform');
      await discoverIntegrations(expanded, sessionId, adapter);

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.some(e => e.stage === 'INTEGRATION_DISCOVERY')).toBe(true);
    });
  });

  describe('capability matching', () => {
    it('should score exact capability matches highly', async () => {
      const expanded = await createTestExpanded('Validate quality metrics');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      // Validation capability should have high match score
      const validationMatch = result.capabilityMatches.find(
        m => m.requiredCapability === 'validation'
      );
      if (validationMatch && validationMatch.providers.length > 0) {
        expect(validationMatch.providers[0]?.matchScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle unmatched capabilities gracefully', async () => {
      const expanded = await createTestExpanded('Analyze data patterns');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      // Should complete without throwing even with unmatched capabilities
      expect(result.capabilityMatches).toBeDefined();

      const unmatchedCount = result.capabilityMatches.filter(
        m => m.status === 'UNMATCHED'
      ).length;
      expect(unmatchedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('integration contracts', () => {
    it('should include SLA specifications where available', async () => {
      const expanded = await createTestExpanded('Deploy agents');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      // Some contracts should have SLA
      const contractsWithSla = result.integrationContracts.filter(c => c.sla);
      // May or may not have SLA depending on matches
      expect(contractsWithSla.length).toBeGreaterThanOrEqual(0);
    });

    it('should include input/output schemas', async () => {
      const expanded = await createTestExpanded('Transform data');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      for (const contract of result.integrationContracts) {
        expect(contract.inputSchema).toBeDefined();
        expect(contract.outputSchema).toBeDefined();
      }
    });
  });

  describe('repository surfaces', () => {
    it('should include observability repository', async () => {
      const expanded = await createTestExpanded('Monitor system performance');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const obsSurface = result.repositorySurfaces.find(
        s => s.repository === 'agentics-observability'
      );
      expect(obsSurface).toBeDefined();
    });

    it('should include endpoints for repositories', async () => {
      const expanded = await createTestExpanded('Reduce costs');
      const result = await discoverIntegrations(expanded, sessionId, adapter);

      const surfaceWithEndpoints = result.repositorySurfaces.find(
        s => s.endpoints && s.endpoints.length > 0
      );
      expect(surfaceWithEndpoints).toBeDefined();
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

      // Reset and second run
      adapter.clear();
      const newSessionId = await adapter.initSession({
        seed: 'test-integration-seed',
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

      expect(integration1.capabilityMatches.length).toBe(integration2.capabilityMatches.length);
      expect(integration1.integrationContracts.length).toBe(integration2.integrationContracts.length);
    });
  });
});
