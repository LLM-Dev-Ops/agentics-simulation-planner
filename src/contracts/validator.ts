/**
 * @agentics/contracts - Contract Validator
 * Validates planning requests against the simulation/v1/request.schema.json contract.
 * This is the ONLY entry point for request validation - all permissive paths are eliminated.
 */

import type {
  ValidatedPlanningRequest,
  ContractValidationResult,
  ContractValidationErrorDetail,
  ContractSimulationConfig,
  ContractScenarioDefinition,
} from './types.js';
import { getCurrentTimestampUTC } from '../utils/text.js';

/** Contract schema version */
export const CONTRACT_VERSION = '1.0.0';
export const SCHEMA_VERSION = 'simulation/v1';

/** Maximum allowed values */
const MAX_INTENT_LENGTH = 10000;
const MAX_ORG_NAME_LENGTH = 256;
const MAX_SEED_LENGTH = 128;
const MAX_NAMESPACE_LENGTH = 64;
const MAX_SCENARIO_NAME_LENGTH = 256;
const MAX_SCENARIO_DESC_LENGTH = 2000;
const MAX_ASSUMPTION_LENGTH = 1000;
const MAX_AGENTS = 10000;
const MAX_CONCURRENCY = 1000;
const MAX_MEMORY_MB = 1048576;
const MIN_MEMORY_MB = 128;
const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 86400000;

/** UUID regex pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Namespace pattern */
const NAMESPACE_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Semver constraint pattern */
const SEMVER_CONSTRAINT_REGEX = /^[\^~>=<|\s0-9.x*-]+$/;

/** Valid ERP domains */
const VALID_DOMAINS = new Set([
  'FINANCE',
  'HUMAN_RESOURCES',
  'OPERATIONS',
  'SUPPLY_CHAIN',
  'CUSTOMER_RELATIONSHIP',
  'PROJECT_MANAGEMENT',
  'ASSET_MANAGEMENT',
  'PROCUREMENT',
]);

/** Valid scope types */
const VALID_SCOPE_TYPES = new Set(['FULL', 'PARTIAL', 'INCREMENTAL']);

/** Valid granularities */
const VALID_GRANULARITIES = new Set(['HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']);

/** Valid execution modes */
const VALID_EXECUTION_MODES = new Set(['strict', 'lenient', 'adaptive']);

/** Valid failure handling modes */
const VALID_FAILURE_HANDLING = new Set(['fail-fast', 'continue', 'retry']);

/** Valid audit levels */
const VALID_AUDIT_LEVELS = new Set(['minimal', 'standard', 'detailed', 'full']);

/** Valid assumption categories */
const VALID_ASSUMPTION_CATEGORIES = new Set(['technical', 'business', 'operational', 'environmental']);

/**
 * Contract validation error class.
 * Thrown when request validation fails.
 */
export class ContractValidationError extends Error {
  readonly code: string;
  readonly errors: readonly ContractValidationErrorDetail[];
  readonly validatedAt: string;

  constructor(errors: readonly ContractValidationErrorDetail[]) {
    const message = `Contract validation failed: ${errors.length} error(s)`;
    super(message);
    this.name = 'ContractValidationError';
    this.code = 'CONTRACT_VALIDATION_FAILED';
    this.errors = errors;
    this.validatedAt = getCurrentTimestampUTC();
  }
}

/**
 * Validates the intent field.
 */
function validateIntent(
  intent: unknown,
  errors: ContractValidationErrorDetail[]
): intent is string {
  if (intent === undefined || intent === null) {
    errors.push({
      path: '/intent',
      message: 'Required field "intent" is missing',
      keyword: 'required',
    });
    return false;
  }

  if (typeof intent !== 'string') {
    errors.push({
      path: '/intent',
      message: `Field "intent" must be a string, got ${typeof intent}`,
      keyword: 'type',
      params: { type: 'string', actual: typeof intent },
    });
    return false;
  }

  if (intent.length === 0) {
    errors.push({
      path: '/intent',
      message: 'Field "intent" cannot be empty',
      keyword: 'minLength',
      params: { limit: 1, actual: 0 },
    });
    return false;
  }

  if (intent.length > MAX_INTENT_LENGTH) {
    errors.push({
      path: '/intent',
      message: `Field "intent" exceeds maximum length of ${MAX_INTENT_LENGTH} characters`,
      keyword: 'maxLength',
      params: { limit: MAX_INTENT_LENGTH, actual: intent.length },
    });
    return false;
  }

  return true;
}

/**
 * Validates UUID format.
 */
function validateUUID(
  value: unknown,
  path: string,
  fieldName: string,
  errors: ContractValidationErrorDetail[]
): boolean {
  if (value === undefined) {
    return true; // Optional field
  }

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: `Field "${fieldName}" must be a string`,
      keyword: 'type',
      params: { type: 'string', actual: typeof value },
    });
    return false;
  }

  if (!UUID_REGEX.test(value)) {
    errors.push({
      path,
      message: `Field "${fieldName}" must be a valid UUID`,
      keyword: 'format',
      params: { format: 'uuid' },
    });
    return false;
  }

  return true;
}

/**
 * Validates string field with length constraints.
 */
function validateString(
  value: unknown,
  path: string,
  fieldName: string,
  minLength: number,
  maxLength: number,
  pattern: RegExp | null,
  errors: ContractValidationErrorDetail[]
): boolean {
  if (value === undefined) {
    return true; // Optional field
  }

  if (typeof value !== 'string') {
    errors.push({
      path,
      message: `Field "${fieldName}" must be a string`,
      keyword: 'type',
      params: { type: 'string', actual: typeof value },
    });
    return false;
  }

  if (value.length < minLength) {
    errors.push({
      path,
      message: `Field "${fieldName}" must be at least ${minLength} characters`,
      keyword: 'minLength',
      params: { limit: minLength, actual: value.length },
    });
    return false;
  }

  if (value.length > maxLength) {
    errors.push({
      path,
      message: `Field "${fieldName}" exceeds maximum length of ${maxLength} characters`,
      keyword: 'maxLength',
      params: { limit: maxLength, actual: value.length },
    });
    return false;
  }

  if (pattern && !pattern.test(value)) {
    errors.push({
      path,
      message: `Field "${fieldName}" does not match required pattern`,
      keyword: 'pattern',
      params: { pattern: pattern.source },
    });
    return false;
  }

  return true;
}

/**
 * Validates the target engine configuration.
 */
function validateTargetEngine(
  engine: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (engine === undefined) {
    return;
  }

  if (typeof engine !== 'object' || engine === null) {
    errors.push({
      path,
      message: 'Field "targetEngine" must be an object',
      keyword: 'type',
    });
    return;
  }

  const engineObj = engine as Record<string, unknown>;

  // CLI compatibility: if targetEngine is present but incomplete, skip validation.
  // The planner will use defaults. Only intent is truly required.
  if (!('engine' in engineObj) || !('versionConstraint' in engineObj)) {
    // Incomplete targetEngine - skip validation, planner will handle defaults
    return;
  }

  // Validate engine if present
  if (engineObj['engine'] !== 'agentics-simulation-engine') {
    errors.push({
      path: `${path}/engine`,
      message: 'Field "engine" must be "agentics-simulation-engine"',
      keyword: 'enum',
      params: { allowedValues: ['agentics-simulation-engine'] },
    });
  }

  // Validate versionConstraint if present
  validateString(
    engineObj['versionConstraint'],
    `${path}/versionConstraint`,
    'versionConstraint',
    1,
    64,
    SEMVER_CONSTRAINT_REGEX,
    errors
  );

  // Optional: requiredCapabilities
  if ('requiredCapabilities' in engineObj) {
    const caps = engineObj['requiredCapabilities'];
    if (!Array.isArray(caps)) {
      errors.push({
        path: `${path}/requiredCapabilities`,
        message: 'Field "requiredCapabilities" must be an array',
        keyword: 'type',
      });
    } else {
      const seen = new Set<string>();
      for (let i = 0; i < caps.length; i++) {
        const cap = caps[i];
        if (typeof cap !== 'string' || cap.length === 0) {
          errors.push({
            path: `${path}/requiredCapabilities/${i}`,
            message: 'Each capability must be a non-empty string',
            keyword: 'type',
          });
        } else if (seen.has(cap)) {
          errors.push({
            path: `${path}/requiredCapabilities/${i}`,
            message: `Duplicate capability: ${cap}`,
            keyword: 'uniqueItems',
          });
        }
        seen.add(cap);
      }
    }
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates the scope configuration.
 */
function validateScope(
  scope: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (scope === undefined) {
    return;
  }

  if (typeof scope !== 'object' || scope === null) {
    errors.push({
      path,
      message: 'Field "scope" must be an object',
      keyword: 'type',
    });
    return;
  }

  const scopeObj = scope as Record<string, unknown>;

  // Optional: type
  if ('type' in scopeObj && !VALID_SCOPE_TYPES.has(scopeObj['type'] as string)) {
    errors.push({
      path: `${path}/type`,
      message: `Invalid scope type. Must be one of: ${[...VALID_SCOPE_TYPES].join(', ')}`,
      keyword: 'enum',
    });
  }

  // Optional: domains
  if ('domains' in scopeObj) {
    const domains = scopeObj['domains'];
    if (!Array.isArray(domains)) {
      errors.push({
        path: `${path}/domains`,
        message: 'Field "domains" must be an array',
        keyword: 'type',
      });
    } else {
      const seen = new Set<string>();
      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];
        if (!VALID_DOMAINS.has(domain)) {
          errors.push({
            path: `${path}/domains/${i}`,
            message: `Invalid domain: ${domain}. Must be one of: ${[...VALID_DOMAINS].join(', ')}`,
            keyword: 'enum',
          });
        } else if (seen.has(domain)) {
          errors.push({
            path: `${path}/domains/${i}`,
            message: `Duplicate domain: ${domain}`,
            keyword: 'uniqueItems',
          });
        }
        seen.add(domain);
      }
    }
  }

  // Optional: timeHorizon
  if ('timeHorizon' in scopeObj) {
    validateTimeHorizon(scopeObj['timeHorizon'], `${path}/timeHorizon`, errors);
  }

  // Optional: dataVolume
  if ('dataVolume' in scopeObj) {
    validateDataVolume(scopeObj['dataVolume'], `${path}/dataVolume`, errors);
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates time horizon configuration.
 */
function validateTimeHorizon(
  timeHorizon: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (typeof timeHorizon !== 'object' || timeHorizon === null) {
    errors.push({
      path,
      message: 'Field "timeHorizon" must be an object',
      keyword: 'type',
    });
    return;
  }

  const thObj = timeHorizon as Record<string, unknown>;

  // Validate dates
  for (const field of ['startDate', 'endDate']) {
    if (field in thObj) {
      const value = thObj[field];
      if (typeof value !== 'string') {
        errors.push({
          path: `${path}/${field}`,
          message: `Field "${field}" must be a string`,
          keyword: 'type',
        });
      } else {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push({
            path: `${path}/${field}`,
            message: `Field "${field}" must be a valid ISO 8601 date-time`,
            keyword: 'format',
            params: { format: 'date-time' },
          });
        }
      }
    }
  }

  // Validate granularity
  if ('granularity' in thObj && !VALID_GRANULARITIES.has(thObj['granularity'] as string)) {
    errors.push({
      path: `${path}/granularity`,
      message: `Invalid granularity. Must be one of: ${[...VALID_GRANULARITIES].join(', ')}`,
      keyword: 'enum',
    });
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates data volume configuration.
 */
function validateDataVolume(
  dataVolume: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (typeof dataVolume !== 'object' || dataVolume === null) {
    errors.push({
      path,
      message: 'Field "dataVolume" must be an object',
      keyword: 'type',
    });
    return;
  }

  const dvObj = dataVolume as Record<string, unknown>;

  // Validate integer fields
  for (const [field, min] of [
    ['minRecords', 0],
    ['maxRecords', 1],
    ['estimatedRecords', 0],
  ] as const) {
    if (field in dvObj) {
      const value = dvObj[field];
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push({
          path: `${path}/${field}`,
          message: `Field "${field}" must be an integer`,
          keyword: 'type',
        });
      } else if (value < min) {
        errors.push({
          path: `${path}/${field}`,
          message: `Field "${field}" must be at least ${min}`,
          keyword: 'minimum',
          params: { limit: min },
        });
      }
    }
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates constraints configuration.
 */
function validateConstraints(
  constraints: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (constraints === undefined) {
    return;
  }

  if (typeof constraints !== 'object' || constraints === null) {
    errors.push({
      path,
      message: 'Field "constraints" must be an object',
      keyword: 'type',
    });
    return;
  }

  const constObj = constraints as Record<string, unknown>;

  // Validate temporal constraints
  if ('temporal' in constObj) {
    validateTemporalConstraints(constObj['temporal'], `${path}/temporal`, errors);
  }

  // Validate resource constraints
  if ('resource' in constObj) {
    validateResourceConstraints(constObj['resource'], `${path}/resource`, errors);
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates temporal constraints.
 */
function validateTemporalConstraints(
  temporal: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (typeof temporal !== 'object' || temporal === null) {
    errors.push({
      path,
      message: 'Field "temporal" must be an object',
      keyword: 'type',
    });
    return;
  }

  const tempObj = temporal as Record<string, unknown>;

  // Validate dates
  for (const field of ['startAfter', 'completeBefore']) {
    if (field in tempObj) {
      const value = tempObj[field];
      if (typeof value !== 'string') {
        errors.push({
          path: `${path}/${field}`,
          message: `Field "${field}" must be a string`,
          keyword: 'type',
        });
      } else {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push({
            path: `${path}/${field}`,
            message: `Field "${field}" must be a valid ISO 8601 date-time`,
            keyword: 'format',
            params: { format: 'date-time' },
          });
        }
      }
    }
  }

  // Validate maxDurationMs
  if ('maxDurationMs' in tempObj) {
    const value = tempObj['maxDurationMs'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        path: `${path}/maxDurationMs`,
        message: 'Field "maxDurationMs" must be an integer',
        keyword: 'type',
      });
    } else if (value < MIN_DURATION_MS || value > MAX_DURATION_MS) {
      errors.push({
        path: `${path}/maxDurationMs`,
        message: `Field "maxDurationMs" must be between ${MIN_DURATION_MS} and ${MAX_DURATION_MS}`,
        keyword: 'range',
        params: { minimum: MIN_DURATION_MS, maximum: MAX_DURATION_MS },
      });
    }
  }

  // Validate timezone
  if ('timezone' in tempObj) {
    validateString(tempObj['timezone'], `${path}/timezone`, 'timezone', 1, 64, null, errors);
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates resource constraints.
 */
function validateResourceConstraints(
  resource: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (typeof resource !== 'object' || resource === null) {
    errors.push({
      path,
      message: 'Field "resource" must be an object',
      keyword: 'type',
    });
    return;
  }

  const resObj = resource as Record<string, unknown>;

  // Validate maxAgents
  if ('maxAgents' in resObj) {
    const value = resObj['maxAgents'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        path: `${path}/maxAgents`,
        message: 'Field "maxAgents" must be an integer',
        keyword: 'type',
      });
    } else if (value < 1 || value > MAX_AGENTS) {
      errors.push({
        path: `${path}/maxAgents`,
        message: `Field "maxAgents" must be between 1 and ${MAX_AGENTS}`,
        keyword: 'range',
        params: { minimum: 1, maximum: MAX_AGENTS },
      });
    }
  }

  // Validate maxConcurrency
  if ('maxConcurrency' in resObj) {
    const value = resObj['maxConcurrency'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        path: `${path}/maxConcurrency`,
        message: 'Field "maxConcurrency" must be an integer',
        keyword: 'type',
      });
    } else if (value < 1 || value > MAX_CONCURRENCY) {
      errors.push({
        path: `${path}/maxConcurrency`,
        message: `Field "maxConcurrency" must be between 1 and ${MAX_CONCURRENCY}`,
        keyword: 'range',
        params: { minimum: 1, maximum: MAX_CONCURRENCY },
      });
    }
  }

  // Validate maxMemoryMB
  if ('maxMemoryMB' in resObj) {
    const value = resObj['maxMemoryMB'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({
        path: `${path}/maxMemoryMB`,
        message: 'Field "maxMemoryMB" must be an integer',
        keyword: 'type',
      });
    } else if (value < MIN_MEMORY_MB || value > MAX_MEMORY_MB) {
      errors.push({
        path: `${path}/maxMemoryMB`,
        message: `Field "maxMemoryMB" must be between ${MIN_MEMORY_MB} and ${MAX_MEMORY_MB}`,
        keyword: 'range',
        params: { minimum: MIN_MEMORY_MB, maximum: MAX_MEMORY_MB },
      });
    }
  }

  // Validate maxCost
  if ('maxCost' in resObj) {
    const value = resObj['maxCost'];
    if (typeof value !== 'number') {
      errors.push({
        path: `${path}/maxCost`,
        message: 'Field "maxCost" must be a number',
        keyword: 'type',
      });
    } else if (value < 0) {
      errors.push({
        path: `${path}/maxCost`,
        message: 'Field "maxCost" must be non-negative',
        keyword: 'minimum',
        params: { limit: 0 },
      });
    }
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates policies configuration.
 */
function validatePolicies(
  policies: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (policies === undefined) {
    return;
  }

  if (typeof policies !== 'object' || policies === null) {
    errors.push({
      path,
      message: 'Field "policies" must be an object',
      keyword: 'type',
    });
    return;
  }

  const polObj = policies as Record<string, unknown>;

  // Validate executionMode
  if ('executionMode' in polObj && !VALID_EXECUTION_MODES.has(polObj['executionMode'] as string)) {
    errors.push({
      path: `${path}/executionMode`,
      message: `Invalid executionMode. Must be one of: ${[...VALID_EXECUTION_MODES].join(', ')}`,
      keyword: 'enum',
    });
  }

  // Validate failureHandling
  if ('failureHandling' in polObj && !VALID_FAILURE_HANDLING.has(polObj['failureHandling'] as string)) {
    errors.push({
      path: `${path}/failureHandling`,
      message: `Invalid failureHandling. Must be one of: ${[...VALID_FAILURE_HANDLING].join(', ')}`,
      keyword: 'enum',
    });
  }

  // Validate auditLevel
  if ('auditLevel' in polObj && !VALID_AUDIT_LEVELS.has(polObj['auditLevel'] as string)) {
    errors.push({
      path: `${path}/auditLevel`,
      message: `Invalid auditLevel. Must be one of: ${[...VALID_AUDIT_LEVELS].join(', ')}`,
      keyword: 'enum',
    });
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates the config object.
 */
function validateConfig(
  config: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (config === undefined) {
    return;
  }

  if (typeof config !== 'object' || config === null) {
    errors.push({
      path,
      message: 'Field "config" must be an object',
      keyword: 'type',
    });
    return;
  }

  const configObj = config as Record<string, unknown>;

  // Validate nested objects
  if ('targetEngine' in configObj) {
    validateTargetEngine(configObj['targetEngine'], `${path}/targetEngine`, errors);
  }

  if ('scope' in configObj) {
    validateScope(configObj['scope'], `${path}/scope`, errors);
  }

  if ('constraints' in configObj) {
    validateConstraints(configObj['constraints'], `${path}/constraints`, errors);
  }

  if ('policies' in configObj) {
    validatePolicies(configObj['policies'], `${path}/policies`, errors);
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates a scenario definition.
 */
function validateScenario(
  scenario: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (scenario === undefined) {
    return;
  }

  if (typeof scenario !== 'object' || scenario === null) {
    errors.push({
      path,
      message: 'Field "scenario" must be an object',
      keyword: 'type',
    });
    return;
  }

  const scenarioObj = scenario as Record<string, unknown>;

  // CLI compatibility: if scenario is present but incomplete, skip validation.
  // The planner will ignore incomplete scenarios. Only intent is truly required.
  if (!('scenarioId' in scenarioObj) || !('name' in scenarioObj)) {
    // Incomplete scenario - skip validation, planner will handle defaults
    return;
  }

  // Validate scenarioId if present
  validateUUID(scenarioObj['scenarioId'], `${path}/scenarioId`, 'scenarioId', errors);

  // Validate name if present
  validateString(
    scenarioObj['name'],
    `${path}/name`,
    'name',
    1,
    MAX_SCENARIO_NAME_LENGTH,
    null,
    errors
  );

  // Optional: description
  if ('description' in scenarioObj) {
    validateString(
      scenarioObj['description'],
      `${path}/description`,
      'description',
      0,
      MAX_SCENARIO_DESC_LENGTH,
      null,
      errors
    );
  }

  // Optional: parameters
  if ('parameters' in scenarioObj) {
    validateScenarioParameters(scenarioObj['parameters'], `${path}/parameters`, errors);
  }

  // Optional: assumptions
  if ('assumptions' in scenarioObj) {
    validateScenarioAssumptions(scenarioObj['assumptions'], `${path}/assumptions`, errors);
  }

  // Optional: dependencies
  if ('dependencies' in scenarioObj) {
    const deps = scenarioObj['dependencies'];
    if (!Array.isArray(deps)) {
      errors.push({
        path: `${path}/dependencies`,
        message: 'Field "dependencies" must be an array',
        keyword: 'type',
      });
    } else {
      const seen = new Set<string>();
      for (let i = 0; i < deps.length; i++) {
        const dep = deps[i];
        if (!validateUUID(dep, `${path}/dependencies/${i}`, `dependencies[${i}]`, errors)) {
          continue;
        }
        if (seen.has(dep)) {
          errors.push({
            path: `${path}/dependencies/${i}`,
            message: `Duplicate dependency: ${dep}`,
            keyword: 'uniqueItems',
          });
        }
        seen.add(dep);
      }
    }
  }

  // Additional properties are ignored for CLI compatibility
}

/**
 * Validates scenario parameters.
 */
function validateScenarioParameters(
  parameters: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (typeof parameters !== 'object' || parameters === null) {
    errors.push({
      path,
      message: 'Field "parameters" must be an object',
      keyword: 'type',
    });
    return;
  }

  const paramObj = parameters as Record<string, unknown>;

  for (const [key, value] of Object.entries(paramObj)) {
    const valuePath = `${path}/${key}`;

    if (value === null || value === undefined) {
      errors.push({
        path: valuePath,
        message: `Parameter "${key}" cannot be null or undefined`,
        keyword: 'type',
      });
      continue;
    }

    const valueType = typeof value;
    const isValidPrimitive = valueType === 'string' || valueType === 'number' || valueType === 'boolean';
    const isValidArray = Array.isArray(value) && value.every(v => typeof v === 'string');

    if (!isValidPrimitive && !isValidArray) {
      errors.push({
        path: valuePath,
        message: `Parameter "${key}" must be a string, number, boolean, or array of strings`,
        keyword: 'oneOf',
      });
    }
  }
}

/**
 * Validates scenario assumptions.
 */
function validateScenarioAssumptions(
  assumptions: unknown,
  path: string,
  errors: ContractValidationErrorDetail[]
): void {
  if (!Array.isArray(assumptions)) {
    errors.push({
      path,
      message: 'Field "assumptions" must be an array',
      keyword: 'type',
    });
    return;
  }

  for (let i = 0; i < assumptions.length; i++) {
    const assumption = assumptions[i];
    const assumptionPath = `${path}/${i}`;

    if (typeof assumption !== 'object' || assumption === null) {
      errors.push({
        path: assumptionPath,
        message: 'Each assumption must be an object',
        keyword: 'type',
      });
      continue;
    }

    const assumptionObj = assumption as Record<string, unknown>;

    // CLI compatibility: if assumption is present but incomplete, skip validation.
    // Only intent is truly required.
    if (!('id' in assumptionObj) || !('statement' in assumptionObj)) {
      // Incomplete assumption - skip validation
      continue;
    }

    // Validate id if present
    validateUUID(assumptionObj['id'], `${assumptionPath}/id`, 'id', errors);

    // Validate statement if present
    validateString(
      assumptionObj['statement'],
      `${assumptionPath}/statement`,
      'statement',
      1,
      MAX_ASSUMPTION_LENGTH,
      null,
      errors
    );

    // Optional: category
    if ('category' in assumptionObj && !VALID_ASSUMPTION_CATEGORIES.has(assumptionObj['category'] as string)) {
      errors.push({
        path: `${assumptionPath}/category`,
        message: `Invalid category. Must be one of: ${[...VALID_ASSUMPTION_CATEGORIES].join(', ')}`,
        keyword: 'enum',
      });
    }

    // Optional: confidence
    if ('confidence' in assumptionObj) {
      const conf = assumptionObj['confidence'];
      if (typeof conf !== 'number') {
        errors.push({
          path: `${assumptionPath}/confidence`,
          message: 'Field "confidence" must be a number',
          keyword: 'type',
        });
      } else if (conf < 0 || conf > 1) {
        errors.push({
          path: `${assumptionPath}/confidence`,
          message: 'Field "confidence" must be between 0 and 1',
          keyword: 'range',
          params: { minimum: 0, maximum: 1 },
        });
      }
    }

    // Additional properties are ignored for CLI compatibility
  }
}

/**
 * Validates a planning request against the contract schema.
 * This is the ONLY entry point for request validation.
 *
 * @param request - The raw request object to validate
 * @returns Validation result with success status and any errors
 * @throws ContractValidationError if validation fails and throwOnError is true
 */
export function validatePlanningRequest(
  request: unknown,
  options: { throwOnError?: boolean } = {}
): ContractValidationResult {
  const errors: ContractValidationErrorDetail[] = [];
  const { throwOnError = false } = options;

  // Request must be an object
  if (typeof request !== 'object' || request === null) {
    errors.push({
      path: '/',
      message: 'Request must be a non-null object',
      keyword: 'type',
    });

    const result: ContractValidationResult = {
      valid: false,
      errors,
      validatedAt: getCurrentTimestampUTC(),
      schemaVersion: SCHEMA_VERSION,
    };

    if (throwOnError) {
      throw new ContractValidationError(errors);
    }
    return result;
  }

  const requestObj = request as Record<string, unknown>;

  // Validate required field: intent
  validateIntent(requestObj['intent'], errors);

  // Validate optional fields
  validateUUID(requestObj['organizationId'], '/organizationId', 'organizationId', errors);
  validateString(
    requestObj['organizationName'],
    '/organizationName',
    'organizationName',
    1,
    MAX_ORG_NAME_LENGTH,
    null,
    errors
  );
  validateString(
    requestObj['seed'],
    '/seed',
    'seed',
    1,
    MAX_SEED_LENGTH,
    null,
    errors
  );
  validateString(
    requestObj['namespace'],
    '/namespace',
    'namespace',
    1,
    MAX_NAMESPACE_LENGTH,
    NAMESPACE_REGEX,
    errors
  );

  // Validate config
  validateConfig(requestObj['config'], '/config', errors);

  // Validate scenario
  validateScenario(requestObj['scenario'], '/scenario', errors);

  // Note: Additional properties at root level are now ignored for CLI compatibility.
  // The CLI may send extra fields that the planner doesn't use.

  const result: ContractValidationResult = {
    valid: errors.length === 0,
    errors,
    validatedAt: getCurrentTimestampUTC(),
    schemaVersion: SCHEMA_VERSION,
  };

  if (throwOnError && !result.valid) {
    throw new ContractValidationError(errors);
  }

  return result;
}

/**
 * Parses and validates a planning request, returning a strongly-typed result.
 * This enforces the contract at the entry point before any planning logic runs.
 *
 * @param request - The raw request object
 * @returns The validated request with proper typing
 * @throws ContractValidationError if validation fails
 */
export function parseAndValidateRequest(request: unknown): ValidatedPlanningRequest {
  validatePlanningRequest(request, { throwOnError: true });

  // At this point, request has been validated
  const req = request as Record<string, unknown>;

  return {
    intent: req['intent'] as string,
    organizationId: req['organizationId'] as string | undefined,
    organizationName: req['organizationName'] as string | undefined,
    seed: req['seed'] as string | undefined,
    namespace: req['namespace'] as string | undefined,
    config: req['config'] as ContractSimulationConfig | undefined,
    scenario: req['scenario'] as ContractScenarioDefinition | undefined,
  };
}
