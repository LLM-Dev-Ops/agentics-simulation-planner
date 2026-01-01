/**
 * Constraint resolution type definitions
 * Defines structures for constraint validation and resolution.
 */

import type {
  UUID,
  Timestamp,
  SHA256Hash,
  ConstraintType,
  Priority,
  ResolutionStrategy,
  ValidationStatus,
} from './common.js';

/** Constraint definition */
export interface Constraint {
  readonly id: UUID;
  readonly type: ConstraintType;
  readonly source: string;
  readonly specification: unknown;
  readonly priority: Priority;
  readonly targetEntity?: string;
}

/** Constraint validation result */
export interface ConstraintValidationResult {
  readonly satisfiable: readonly Constraint[];
  readonly unsatisfiable: readonly Constraint[];
  readonly unknown: readonly Constraint[];
}

/** Constraint conflict */
export interface ConstraintConflict {
  readonly id: UUID;
  readonly constraint1: Constraint;
  readonly constraint2: Constraint;
  readonly conflictType: string;
  readonly severity: string;
}

/** Resolution of a constraint conflict */
export interface Resolution {
  readonly conflictId: UUID;
  readonly strategy: ResolutionStrategy | 'UNRESOLVED';
  readonly winner?: Constraint;
  readonly loser?: Constraint;
}

/** Ordered constraint set */
export interface OrderedConstraintSet {
  readonly constraints: readonly Constraint[];
  readonly ordering: readonly [UUID, number][];
  readonly hash: SHA256Hash;
}

/** Resolved constraints */
export interface ResolvedConstraints {
  readonly id: UUID;
  readonly integrationMapId: UUID;
  readonly allConstraints: readonly Constraint[];
  readonly validationResult: ConstraintValidationResult;
  readonly conflicts: readonly ConstraintConflict[];
  readonly resolutions: readonly Resolution[];
  readonly orderedConstraints: OrderedConstraintSet;
  readonly resolutionStatus: 'PENDING' | 'RESOLVED';
  readonly timestamp: Timestamp;
}
