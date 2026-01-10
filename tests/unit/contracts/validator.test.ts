/**
 * Contract Validator Tests
 * Tests for @agentics/contracts request validation
 */

import {
  validatePlanningRequest,
  parseAndValidateRequest,
  ContractValidationError,
  CONTRACT_VERSION,
  SCHEMA_VERSION,
} from '../../../src/contracts/index.js';

describe('Contract Validator', () => {
  describe('validatePlanningRequest', () => {
    describe('valid requests', () => {
      it('should accept a minimal valid request with only intent', () => {
        const request = { intent: 'Optimize warehouse operations' };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      });

      it('should accept a request with all optional fields', () => {
        const request = {
          intent: 'Optimize warehouse operations',
          organizationName: 'Acme Corp',
          organizationId: '12345678-1234-1234-1234-123456789abc',
          seed: 'test-seed-123',
          namespace: 'production',
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept a request with config', () => {
        const request = {
          intent: 'Optimize warehouse operations',
          config: {
            targetEngine: {
              engine: 'agentics-simulation-engine',
              versionConstraint: '^1.0.0',
              requiredCapabilities: ['parallel-execution'],
            },
            scope: {
              type: 'FULL',
              domains: ['OPERATIONS', 'SUPPLY_CHAIN'],
            },
            constraints: {
              temporal: {
                maxDurationMs: 3600000,
              },
              resource: {
                maxAgents: 100,
                maxConcurrency: 10,
              },
            },
            policies: {
              executionMode: 'strict',
              failureHandling: 'fail-fast',
              auditLevel: 'detailed',
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept a request with scenario', () => {
        const request = {
          intent: 'Optimize warehouse operations',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            name: 'Peak Season Scenario',
            description: 'Simulates peak holiday shopping season',
            parameters: {
              orderVolume: 10000,
              staffingLevel: 'high',
              useOvertime: true,
              regions: ['US-EAST', 'US-WEST'],
            },
            assumptions: [
              {
                id: '12345678-1234-1234-1234-123456789def',
                statement: 'Order volume increases 3x during peak season',
                category: 'business',
                confidence: 0.95,
              },
            ],
            dependencies: [],
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('invalid requests - missing required fields', () => {
      it('should reject null request', () => {
        const result = validatePlanningRequest(null);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.path).toBe('/');
        expect(result.errors[0]!.keyword).toBe('type');
      });

      it('should reject request without intent', () => {
        const result = validatePlanningRequest({});

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/intent')).toBe(true);
      });

      it('should reject request with empty intent', () => {
        const result = validatePlanningRequest({ intent: '' });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/intent' && e.keyword === 'minLength')).toBe(true);
      });

      it('should reject request with non-string intent', () => {
        const result = validatePlanningRequest({ intent: 123 });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/intent' && e.keyword === 'type')).toBe(true);
      });
    });

    describe('invalid requests - field constraints', () => {
      it('should reject intent exceeding max length', () => {
        const request = { intent: 'a'.repeat(10001) };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/intent' && e.keyword === 'maxLength')).toBe(true);
      });

      it('should reject invalid organizationId format', () => {
        const request = {
          intent: 'Test intent',
          organizationId: 'not-a-uuid',
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/organizationId' && e.keyword === 'format')).toBe(true);
      });

      it('should reject invalid namespace pattern', () => {
        const request = {
          intent: 'Test intent',
          namespace: 'invalid namespace!',
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path === '/namespace' && e.keyword === 'pattern')).toBe(true);
      });
    });

    describe('invalid requests - config validation', () => {
      it('should reject invalid target engine', () => {
        const request = {
          intent: 'Test intent',
          config: {
            targetEngine: {
              engine: 'invalid-engine',
              versionConstraint: '^1.0.0',
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('targetEngine/engine'))).toBe(true);
      });

      it('should accept incomplete targetEngine for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          config: {
            targetEngine: {
              engine: 'agentics-simulation-engine',
              // missing versionConstraint - should be accepted for CLI compatibility
            },
          },
        };
        const result = validatePlanningRequest(request);

        // Incomplete nested objects are now accepted - only intent is required
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid scope type', () => {
        const request = {
          intent: 'Test intent',
          config: {
            scope: {
              type: 'INVALID_TYPE',
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('scope/type'))).toBe(true);
      });

      it('should reject invalid domain in scope', () => {
        const request = {
          intent: 'Test intent',
          config: {
            scope: {
              domains: ['OPERATIONS', 'INVALID_DOMAIN'],
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('domains'))).toBe(true);
      });

      it('should reject duplicate domains', () => {
        const request = {
          intent: 'Test intent',
          config: {
            scope: {
              domains: ['OPERATIONS', 'OPERATIONS'],
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.keyword === 'uniqueItems')).toBe(true);
      });

      it('should reject maxAgents outside valid range', () => {
        const request = {
          intent: 'Test intent',
          config: {
            constraints: {
              resource: {
                maxAgents: 0, // Must be >= 1
              },
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('maxAgents'))).toBe(true);
      });

      it('should reject maxMemoryMB outside valid range', () => {
        const request = {
          intent: 'Test intent',
          config: {
            constraints: {
              resource: {
                maxMemoryMB: 50, // Must be >= 128
              },
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('maxMemoryMB'))).toBe(true);
      });

      it('should reject negative maxCost', () => {
        const request = {
          intent: 'Test intent',
          config: {
            constraints: {
              resource: {
                maxCost: -100,
              },
            },
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('maxCost'))).toBe(true);
      });
    });

    describe('scenario validation - CLI compatibility', () => {
      it('should accept scenario without scenarioId for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            name: 'Test Scenario',
            // missing scenarioId - accepted for CLI compatibility
          },
        };
        const result = validatePlanningRequest(request);

        // Incomplete scenarios are now accepted - only intent is required
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept scenario without name for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            // missing name - accepted for CLI compatibility
          },
        };
        const result = validatePlanningRequest(request);

        // Incomplete scenarios are now accepted - only intent is required
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid assumption id', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            name: 'Test Scenario',
            assumptions: [
              {
                id: 'not-a-uuid',
                statement: 'Test assumption',
              },
            ],
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('assumptions') && e.keyword === 'format')).toBe(true);
      });

      it('should reject invalid assumption category', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            name: 'Test Scenario',
            assumptions: [
              {
                id: '12345678-1234-1234-1234-123456789def',
                statement: 'Test assumption',
                category: 'invalid-category',
              },
            ],
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('category'))).toBe(true);
      });

      it('should reject confidence outside 0-1 range', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            name: 'Test Scenario',
            assumptions: [
              {
                id: '12345678-1234-1234-1234-123456789def',
                statement: 'Test assumption',
                confidence: 1.5,
              },
            ],
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path.includes('confidence'))).toBe(true);
      });
    });

    describe('additional properties handling - CLI compatibility', () => {
      it('should accept unknown properties at root level for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          unknownField: 'CLI may send extra fields',
          organizationalContext: { name: 'Test Org' },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept unknown properties in config for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          config: {
            unknownConfigField: 'CLI may send extra fields',
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should accept unknown properties in scenario for CLI compatibility', () => {
        const request = {
          intent: 'Test intent',
          scenario: {
            scenarioId: '12345678-1234-1234-1234-123456789abc',
            name: 'Test Scenario',
            extraField: 'CLI may send extra fields',
          },
        };
        const result = validatePlanningRequest(request);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('throwOnError option', () => {
      it('should throw ContractValidationError when throwOnError is true', () => {
        expect(() => {
          validatePlanningRequest({}, { throwOnError: true });
        }).toThrow(ContractValidationError);
      });

      it('should not throw when request is valid and throwOnError is true', () => {
        expect(() => {
          validatePlanningRequest({ intent: 'Test' }, { throwOnError: true });
        }).not.toThrow();
      });
    });
  });

  describe('parseAndValidateRequest', () => {
    it('should return a typed ValidatedPlanningRequest for valid input', () => {
      const request = {
        intent: 'Optimize operations',
        organizationName: 'Acme Corp',
        seed: 'test-seed',
      };

      const validated = parseAndValidateRequest(request);

      expect(validated.intent).toBe('Optimize operations');
      expect(validated.organizationName).toBe('Acme Corp');
      expect(validated.seed).toBe('test-seed');
    });

    it('should throw ContractValidationError for invalid input', () => {
      expect(() => {
        parseAndValidateRequest({ intent: '' });
      }).toThrow(ContractValidationError);
    });

    it('should preserve config and scenario in validated request', () => {
      const request = {
        intent: 'Test intent',
        config: {
          targetEngine: {
            engine: 'agentics-simulation-engine',
            versionConstraint: '^1.0.0',
          },
        },
        scenario: {
          scenarioId: '12345678-1234-1234-1234-123456789abc',
          name: 'Test Scenario',
        },
      };

      const validated = parseAndValidateRequest(request);

      expect(validated.config).toBeDefined();
      expect(validated.config!.targetEngine!.engine).toBe('agentics-simulation-engine');
      expect(validated.scenario).toBeDefined();
      expect(validated.scenario!.name).toBe('Test Scenario');
    });
  });

  describe('ContractValidationError', () => {
    it('should contain all error details', () => {
      try {
        // Empty intent should cause validation error (unknownField is now allowed)
        validatePlanningRequest({ intent: '' }, { throwOnError: true });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContractValidationError);
        const validationError = error as ContractValidationError;
        expect(validationError.code).toBe('CONTRACT_VALIDATION_FAILED');
        expect(validationError.errors.length).toBeGreaterThan(0);
        expect(validationError.validatedAt).toBeDefined();
      }
    });
  });
});
