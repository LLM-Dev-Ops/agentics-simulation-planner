/**
 * Unit tests for error types
 */

import {
  PlanningError,
  ValidationError,
  DecompositionError,
  ExpansionError,
  IntegrationError,
  ConstraintError,
  SchemaValidationError,
  SemanticValidationError,
  KeyFormatError,
  IntegrityError,
} from '../../src/types/errors.js';

describe('Error Types', () => {
  describe('PlanningError', () => {
    it('should create error with all properties', () => {
      const error = new PlanningError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        severity: 'FATAL',
        stage: 'INTENT_INGESTION',
        context: { key: 'value' },
        recoverable: true,
        retryable: true,
      });

      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.severity).toBe('FATAL');
      expect(error.stage).toBe('INTENT_INGESTION');
      expect(error.context).toEqual({ key: 'value' });
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('PlanningError');
    });

    it('should use default values for optional properties', () => {
      const error = new PlanningError({
        code: 'TEST_ERROR',
        message: 'Test message',
        severity: 'ERROR',
        stage: 'SERIALIZATION',
      });

      expect(error.context).toEqual({});
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError({
        code: 'INVALID_INPUT',
        message: 'Invalid input',
        severity: 'FATAL',
        details: ['field1 is required', 'field2 must be positive'],
      });

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.details).toEqual(['field1 is required', 'field2 must be positive']);
      expect(error.stage).toBe('INTENT_INGESTION');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('DecompositionError', () => {
    it('should create decomposition error with cycles', () => {
      const error = new DecompositionError({
        code: 'CYCLE_DETECTED',
        message: 'Dependency graph contains cycles',
        severity: 'FATAL',
        cycles: [['a', 'b', 'c'], ['d', 'e']],
      });

      expect(error.name).toBe('DecompositionError');
      expect(error.cycles).toEqual([['a', 'b', 'c'], ['d', 'e']]);
      expect(error.stage).toBe('INTENT_DECOMPOSITION');
    });
  });

  describe('ExpansionError', () => {
    it('should create expansion error', () => {
      const error = new ExpansionError({
        code: 'NO_MATCHING_AGENT',
        message: 'No agent found',
        objective: { id: 'obj-1', action: 'test' },
      });

      expect(error.name).toBe('ExpansionError');
      expect(error.objective).toEqual({ id: 'obj-1', action: 'test' });
      expect(error.stage).toBe('AGENT_WORKFLOW_EXPANSION');
    });
  });

  describe('IntegrationError', () => {
    it('should create integration error', () => {
      const error = new IntegrationError({
        code: 'UNMATCHED_CAPABILITIES',
        message: 'Some capabilities could not be matched',
        severity: 'WARNING',
        unmatched: ['capability1', 'capability2'],
      });

      expect(error.name).toBe('IntegrationError');
      expect(error.unmatched).toEqual(['capability1', 'capability2']);
      expect(error.recoverable).toBe(true);
    });

    it('should not be recoverable for FATAL severity', () => {
      const error = new IntegrationError({
        code: 'CRITICAL_FAILURE',
        message: 'Critical integration failure',
        severity: 'FATAL',
      });

      expect(error.recoverable).toBe(false);
    });
  });

  describe('ConstraintError', () => {
    it('should create constraint error', () => {
      const error = new ConstraintError({
        code: 'UNSATISFIABLE',
        message: 'Constraints cannot be satisfied',
        severity: 'FATAL',
        constraints: [
          { id: 'c1', type: 'TEMPORAL', source: 'test', specification: 'spec', priority: 'HIGH' },
        ],
      });

      expect(error.name).toBe('ConstraintError');
      expect(error.constraints?.length).toBe(1);
      expect(error.stage).toBe('CONSTRAINT_RESOLUTION');
    });
  });

  describe('SchemaValidationError', () => {
    it('should create schema validation error', () => {
      const error = new SchemaValidationError({
        code: 'SCHEMA_INVALID',
        message: 'Schema validation failed',
        errors: [{ field: 'id', message: 'required' }],
      });

      expect(error.name).toBe('SchemaValidationError');
      expect(error.errors).toEqual([{ field: 'id', message: 'required' }]);
      expect(error.stage).toBe('VALIDATION_NORMALIZATION');
    });
  });

  describe('SemanticValidationError', () => {
    it('should create semantic validation error', () => {
      const error = new SemanticValidationError({
        code: 'SEMANTIC_INVALID',
        message: 'Semantic validation failed',
        issues: [{ type: 'INVALID_REFERENCE', message: 'Bad ref' }],
      });

      expect(error.name).toBe('SemanticValidationError');
      expect(error.issues).toEqual([{ type: 'INVALID_REFERENCE', message: 'Bad ref' }]);
    });
  });

  describe('KeyFormatError', () => {
    it('should create key format error', () => {
      const error = new KeyFormatError('Invalid key format');
      expect(error.name).toBe('KeyFormatError');
      expect(error.message).toBe('Invalid key format');
    });
  });

  describe('IntegrityError', () => {
    it('should create integrity error', () => {
      const error = new IntegrityError('Checksum mismatch');
      expect(error.name).toBe('IntegrityError');
      expect(error.message).toBe('Checksum mismatch');
    });
  });
});
