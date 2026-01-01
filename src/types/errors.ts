/**
 * Error type definitions
 * Defines error classes for the planning pipeline.
 */

import type { ErrorSeverity, PipelineStage, UUID } from './common.js';
import type { Constraint, ConstraintConflict } from './constraint.js';

/** Base planning error */
export class PlanningError extends Error {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly stage: PipelineStage;
  readonly context: Record<string, unknown>;
  readonly recoverable: boolean;
  readonly retryable: boolean;

  constructor(options: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    stage: PipelineStage;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = 'PlanningError';
    this.code = options.code;
    this.severity = options.severity;
    this.stage = options.stage;
    this.context = options.context ?? {};
    this.recoverable = options.recoverable ?? false;
    this.retryable = options.retryable ?? false;
  }
}

/** Validation error */
export class ValidationError extends PlanningError {
  readonly details: readonly string[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    details?: readonly string[];
  }) {
    super({
      ...options,
      stage: 'INTENT_INGESTION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'ValidationError';
    this.details = options.details ?? undefined;
  }
}

/** Decomposition error */
export class DecompositionError extends PlanningError {
  readonly cycles: readonly UUID[][] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    cycles?: readonly UUID[][];
  }) {
    super({
      ...options,
      stage: 'INTENT_DECOMPOSITION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'DecompositionError';
    this.cycles = options.cycles ?? undefined;
  }
}

/** Expansion error */
export class ExpansionError extends PlanningError {
  readonly objective: unknown | undefined;
  readonly issues: readonly unknown[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity?: ErrorSeverity;
    objective?: unknown;
    issues?: readonly unknown[];
  }) {
    super({
      ...options,
      severity: options.severity ?? 'FATAL',
      stage: 'AGENT_WORKFLOW_EXPANSION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'ExpansionError';
    this.objective = options.objective ?? undefined;
    this.issues = options.issues ?? undefined;
  }
}

/** Integration error */
export class IntegrationError extends PlanningError {
  readonly unmatched: readonly string[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    unmatched?: readonly string[];
  }) {
    super({
      ...options,
      stage: 'INTEGRATION_DISCOVERY',
      recoverable: options.severity !== 'FATAL',
      retryable: false,
    });
    this.name = 'IntegrationError';
    this.unmatched = options.unmatched ?? undefined;
  }
}

/** Constraint error */
export class ConstraintError extends PlanningError {
  readonly constraints: readonly Constraint[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    constraints?: readonly Constraint[];
  }) {
    super({
      ...options,
      stage: 'CONSTRAINT_RESOLUTION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'ConstraintError';
    this.constraints = options.constraints ?? undefined;
  }
}

/** Schema validation error */
export class SchemaValidationError extends PlanningError {
  readonly errors: readonly unknown[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity?: ErrorSeverity;
    errors?: readonly unknown[];
  }) {
    super({
      ...options,
      severity: options.severity ?? 'FATAL',
      stage: 'VALIDATION_NORMALIZATION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'SchemaValidationError';
    this.errors = options.errors ?? undefined;
  }
}

/** Semantic validation error */
export class SemanticValidationError extends PlanningError {
  readonly issues: readonly unknown[] | undefined;

  constructor(options: {
    code: string;
    message: string;
    severity?: ErrorSeverity;
    issues?: readonly unknown[];
  }) {
    super({
      ...options,
      severity: options.severity ?? 'FATAL',
      stage: 'VALIDATION_NORMALIZATION',
      recoverable: false,
      retryable: false,
    });
    this.name = 'SemanticValidationError';
    this.issues = options.issues ?? undefined;
  }
}

/** Key format error */
export class KeyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyFormatError';
  }
}

/** Integrity error */
export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}
