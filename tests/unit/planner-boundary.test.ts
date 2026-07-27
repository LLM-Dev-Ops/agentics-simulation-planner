/**
 * Tests for PlannerBoundary
 *
 * These tests verify that the planner boundary types and guards correctly
 * prevent prohibited operations and document delegations to other systems.
 */

import {
  isPlannerOperation,
  isProhibitedOperation,
  createBoundaryViolation,
  getDelegationTarget,
  getHandoffContract,
  DEFAULT_PLANNER_BOUNDARY,
  ALLOWED_PLANNER_OPERATIONS,
  PROHIBITED_PLANNER_OPERATIONS,
  DEFAULT_DELEGATED_OPERATIONS,
  type PlannerOperation,
  type ProhibitedOperation,
  type BoundaryViolation,
} from '../../src/types/planner-boundary.js';

describe('PlannerBoundary', () => {
  describe('ALLOWED_PLANNER_OPERATIONS', () => {
    it('should include core planning operations', () => {
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('PARSE_INTENT');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('DECOMPOSE_OBJECTIVES');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('EXTRACT_TOPOLOGY');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('DISCOVER_INTEGRATIONS');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('RESOLVE_CONSTRAINTS');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('VALIDATE_PLAN');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('SERIALIZE_PLAN');
    });

    it('should include new planning operations for targeting engine', () => {
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('DEFINE_SCOPE');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('SPECIFY_ERP_DEPENDENCIES');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('DECLARE_POLICY_INPUTS');
      expect(ALLOWED_PLANNER_OPERATIONS).toContain('DESCRIBE_OUTPUT_ARTIFACTS');
    });

    it('should have exactly 11 allowed operations', () => {
      expect(ALLOWED_PLANNER_OPERATIONS).toHaveLength(11);
    });
  });

  describe('PROHIBITED_PLANNER_OPERATIONS', () => {
    it('should prohibit execution', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('EXECUTE_SIMULATION');
    });

    it('should prohibit ROI calculations', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('CALCULATE_ROI');
    });

    it('should prohibit ERP data normalization', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('NORMALIZE_ERP_DATA');
    });

    it('should prohibit external API calls', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('CALL_EXTERNAL_APIS');
    });

    it('should prohibit ERP state mutations', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('MUTATE_ERP_STATE');
    });

    it('should prohibit transaction processing', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('PROCESS_TRANSACTIONS');
    });

    it('should prohibit report generation', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('GENERATE_REPORTS');
    });

    it('should prohibit job scheduling', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toContain('SCHEDULE_JOBS');
    });

    it('should have exactly 8 prohibited operations', () => {
      expect(PROHIBITED_PLANNER_OPERATIONS).toHaveLength(8);
    });
  });

  describe('isPlannerOperation()', () => {
    it('should return true for allowed operations', () => {
      expect(isPlannerOperation('PARSE_INTENT')).toBe(true);
      expect(isPlannerOperation('DECOMPOSE_OBJECTIVES')).toBe(true);
      expect(isPlannerOperation('DEFINE_SCOPE')).toBe(true);
      expect(isPlannerOperation('SPECIFY_ERP_DEPENDENCIES')).toBe(true);
    });

    it('should return false for prohibited operations', () => {
      expect(isPlannerOperation('EXECUTE_SIMULATION')).toBe(false);
      expect(isPlannerOperation('CALCULATE_ROI')).toBe(false);
      expect(isPlannerOperation('NORMALIZE_ERP_DATA')).toBe(false);
    });

    it('should return false for unknown operations', () => {
      expect(isPlannerOperation('UNKNOWN_OPERATION')).toBe(false);
      expect(isPlannerOperation('')).toBe(false);
    });
  });

  describe('isProhibitedOperation()', () => {
    it('should return true for prohibited operations', () => {
      expect(isProhibitedOperation('EXECUTE_SIMULATION')).toBe(true);
      expect(isProhibitedOperation('CALCULATE_ROI')).toBe(true);
      expect(isProhibitedOperation('NORMALIZE_ERP_DATA')).toBe(true);
      expect(isProhibitedOperation('MUTATE_ERP_STATE')).toBe(true);
    });

    it('should return false for allowed operations', () => {
      expect(isProhibitedOperation('PARSE_INTENT')).toBe(false);
      expect(isProhibitedOperation('VALIDATE_PLAN')).toBe(false);
    });

    it('should return false for unknown operations', () => {
      expect(isProhibitedOperation('UNKNOWN_OPERATION')).toBe(false);
    });
  });

  describe('getDelegationTarget()', () => {
    it('should return agentics-simulation-runner for execution', () => {
      expect(getDelegationTarget('EXECUTE_SIMULATION')).toBe('agentics-simulation-runner');
    });

    it('should return analytics-service for ROI calculation', () => {
      expect(getDelegationTarget('CALCULATE_ROI')).toBe('analytics-service');
    });

    it('should return erp-adapter for ERP normalization', () => {
      expect(getDelegationTarget('NORMALIZE_ERP_DATA')).toBe('erp-adapter');
    });

    it('should return erp-adapter for ERP state mutation', () => {
      expect(getDelegationTarget('MUTATE_ERP_STATE')).toBe('erp-adapter');
    });

    it('should return erp-adapter for transaction processing', () => {
      expect(getDelegationTarget('PROCESS_TRANSACTIONS')).toBe('erp-adapter');
    });

    it('should return analytics-service for report generation', () => {
      expect(getDelegationTarget('GENERATE_REPORTS')).toBe('analytics-service');
    });

    it('should return orchestration-layer for job scheduling', () => {
      expect(getDelegationTarget('SCHEDULE_JOBS')).toBe('orchestration-layer');
    });

    it('should return agentics-simulation-runner for external API calls', () => {
      expect(getDelegationTarget('CALL_EXTERNAL_APIS')).toBe('agentics-simulation-runner');
    });
  });

  describe('getHandoffContract()', () => {
    it('should return SimulationPlan for execution', () => {
      expect(getHandoffContract('EXECUTE_SIMULATION')).toBe('SimulationPlan');
    });

    it('should return FinancialMetricsRequest for ROI calculation', () => {
      expect(getHandoffContract('CALCULATE_ROI')).toBe('FinancialMetricsRequest');
    });

    it('should return ERPDataRequest for ERP normalization', () => {
      expect(getHandoffContract('NORMALIZE_ERP_DATA')).toBe('ERPDataRequest');
    });

    it('should return IntegrationSpec for external API calls', () => {
      expect(getHandoffContract('CALL_EXTERNAL_APIS')).toBe('IntegrationSpec');
    });
  });

  describe('createBoundaryViolation()', () => {
    it('should create a violation for EXECUTE_SIMULATION', () => {
      const violation = createBoundaryViolation(
        'EXECUTE_SIMULATION',
        'SERIALIZATION',
        'Attempted to start simulation during plan creation'
      );

      expect(violation.violationType).toBe('EXECUTE_SIMULATION');
      expect(violation.detectedAt).toBe('SERIALIZATION');
      expect(violation.severity).toBe('FATAL');
      expect(violation.correctHandler).toBe('agentics-simulation-runner');
      expect(violation.remediation).toContain('agentics-simulation-runner');
      expect(violation.remediation).toContain('SimulationPlan');
    });

    it('should create a violation for CALCULATE_ROI', () => {
      const violation = createBoundaryViolation(
        'CALCULATE_ROI',
        'CONSTRAINT_RESOLUTION',
        'Attempted to compute ROI during constraint resolution'
      );

      expect(violation.violationType).toBe('CALCULATE_ROI');
      expect(violation.correctHandler).toBe('analytics-service');
      expect(violation.remediation).toContain('analytics-service');
    });

    it('should include context in the violation', () => {
      const context = 'Specific context about the violation';
      const violation = createBoundaryViolation(
        'NORMALIZE_ERP_DATA',
        'INTEGRATION_DISCOVERY',
        context
      );

      expect(violation.context).toBe(context);
    });

    it('should always set severity to FATAL', () => {
      const violation = createBoundaryViolation(
        'MUTATE_ERP_STATE',
        'AGENT_WORKFLOW_EXPANSION',
        'Test context'
      );

      expect(violation.severity).toBe('FATAL');
    });
  });

  describe('DEFAULT_PLANNER_BOUNDARY', () => {
    it('should have version 1.0.0', () => {
      expect(DEFAULT_PLANNER_BOUNDARY.version).toBe('1.0.0');
    });

    it('should include all allowed operations', () => {
      expect(DEFAULT_PLANNER_BOUNDARY.allowedOperations).toEqual(ALLOWED_PLANNER_OPERATIONS);
    });

    it('should include all prohibited operations', () => {
      expect(DEFAULT_PLANNER_BOUNDARY.prohibitedOperations).toEqual(PROHIBITED_PLANNER_OPERATIONS);
    });

    it('should include all delegated operations', () => {
      expect(DEFAULT_PLANNER_BOUNDARY.delegatedOperations).toEqual(DEFAULT_DELEGATED_OPERATIONS);
    });

    it('should have delegation for every prohibited operation', () => {
      for (const prohibited of PROHIBITED_PLANNER_OPERATIONS) {
        const delegation = DEFAULT_DELEGATED_OPERATIONS.find(
          d => d.operation === prohibited
        );
        expect(delegation).toBeDefined();
        expect(delegation?.delegatedTo).toBeDefined();
        expect(delegation?.handoffContract).toBeDefined();
        expect(delegation?.rationale).toBeDefined();
      }
    });
  });

  describe('DEFAULT_DELEGATED_OPERATIONS', () => {
    it('should have 8 delegated operations (one per prohibited)', () => {
      expect(DEFAULT_DELEGATED_OPERATIONS).toHaveLength(8);
    });

    it('should have rationale for each delegation', () => {
      for (const delegation of DEFAULT_DELEGATED_OPERATIONS) {
        expect(delegation.rationale.length).toBeGreaterThan(20);
      }
    });

    it('should delegate to valid systems', () => {
      const validTargets = [
        'agentics-simulation-runner',
        'erp-adapter',
        'analytics-service',
        'orchestration-layer',
      ];

      for (const delegation of DEFAULT_DELEGATED_OPERATIONS) {
        expect(validTargets).toContain(delegation.delegatedTo);
      }
    });
  });

  describe('Separation of Concerns', () => {
    it('should not allow execution-related operations', () => {
      const executionOps = ['EXECUTE_SIMULATION', 'CALL_EXTERNAL_APIS', 'SCHEDULE_JOBS'];
      for (const op of executionOps) {
        expect(isPlannerOperation(op)).toBe(false);
        expect(isProhibitedOperation(op)).toBe(true);
      }
    });

    it('should not allow financial calculation operations', () => {
      expect(isPlannerOperation('CALCULATE_ROI')).toBe(false);
      expect(isProhibitedOperation('CALCULATE_ROI')).toBe(true);
    });

    it('should not allow ERP data operations', () => {
      const erpOps = ['NORMALIZE_ERP_DATA', 'MUTATE_ERP_STATE', 'PROCESS_TRANSACTIONS'];
      for (const op of erpOps) {
        expect(isPlannerOperation(op)).toBe(false);
        expect(isProhibitedOperation(op)).toBe(true);
      }
    });

    it('should allow all planning operations', () => {
      const planningOps = [
        'PARSE_INTENT',
        'DECOMPOSE_OBJECTIVES',
        'EXTRACT_TOPOLOGY',
        'DISCOVER_INTEGRATIONS',
        'RESOLVE_CONSTRAINTS',
        'VALIDATE_PLAN',
        'SERIALIZE_PLAN',
        'DEFINE_SCOPE',
        'SPECIFY_ERP_DEPENDENCIES',
        'DECLARE_POLICY_INPUTS',
        'DESCRIBE_OUTPUT_ARTIFACTS',
      ];
      for (const op of planningOps) {
        expect(isPlannerOperation(op)).toBe(true);
        expect(isProhibitedOperation(op)).toBe(false);
      }
    });
  });
});
