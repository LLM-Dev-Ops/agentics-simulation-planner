/**
 * Stage 6: Constraint Resolution Module
 * Collects, validates, and resolves constraints across all pipeline outputs.
 */

import type {
  UUID,
  ExpandedAgentsAndWorkflows,
  IntegrationMap,
  StructuredIntent,
  ResolvedConstraints,
  Constraint,
  ConstraintValidationResult,
  ConstraintConflict,
  Resolution,
  OrderedConstraintSet,
  ConstraintType,
  Priority,
  ResolutionStrategy,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { ConstraintError } from '../types/errors.js';
import { generateDeterministicId, computeOrderingHash } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Priority order for constraint resolution */
const PRIORITY_ORDER: Record<Priority, number> = {
  'CRITICAL': 4,
  'HIGH': 3,
  'MEDIUM': 2,
  'LOW': 1,
};

/** Constraint type hierarchy for conflict resolution */
const TYPE_AUTHORITY: Record<ConstraintType, number> = {
  'AUTHORIZATION': 6,
  'SLA': 5,
  'TEMPORAL': 4,
  'DEPENDENCY': 3,
  'RESOURCE': 2,
  'PRECONDITION': 1,
  'POSTCONDITION': 1,
  'REQUIRES': 1,
};

/**
 * Collects all constraints from pipeline outputs
 */
function collectConstraints(
  intent: StructuredIntent,
  expanded: ExpandedAgentsAndWorkflows,
  integrationMap: IntegrationMap,
  sessionId: UUID
): readonly Constraint[] {
  const constraints: Constraint[] = [];
  let index = 0;

  // Collect from intent components
  for (const objective of intent.components.objectives) {
    for (const objConstraint of objective.constraints) {
      constraints.push({
        id: generateDeterministicId('constraint', sessionId, 'intent', String(index++)),
        type: objConstraint.type,
        source: 'intent',
        specification: objConstraint.specification,
        priority: objConstraint.priority,
        targetEntity: objConstraint.targetEntity,
      });
    }
  }

  // Collect from organizational context
  for (const ctxConstraint of intent.context.constraints.constraints) {
    constraints.push({
      id: generateDeterministicId('constraint', sessionId, 'context', String(index++)),
      type: ctxConstraint.type,
      source: 'organizational_context',
      specification: ctxConstraint.specification,
      priority: ctxConstraint.priority,
      targetEntity: ctxConstraint.targetEntity,
    });
  }

  // Collect from workflow steps
  for (const workflow of expanded.workflowDefinitions) {
    for (const step of workflow.steps) {
      for (const precond of step.preconditions) {
        constraints.push({
          id: generateDeterministicId('constraint', sessionId, 'workflow', String(index++)),
          type: 'PRECONDITION',
          source: `workflow:${workflow.id}:step:${step.id}`,
          specification: precond.specification,
          priority: 'MEDIUM',
          targetEntity: step.objectiveId,
        });
      }
      for (const postcond of step.postconditions) {
        constraints.push({
          id: generateDeterministicId('constraint', sessionId, 'workflow', String(index++)),
          type: 'POSTCONDITION',
          source: `workflow:${workflow.id}:step:${step.id}`,
          specification: postcond.specification,
          priority: 'MEDIUM',
          targetEntity: step.objectiveId,
        });
      }
    }
  }

  // Collect SLA constraints from integration contracts
  for (const contract of integrationMap.integrationContracts) {
    if (contract.sla) {
      constraints.push({
        id: generateDeterministicId('constraint', sessionId, 'sla', String(index++)),
        type: 'SLA',
        source: `integration:${contract.provider}`,
        specification: contract.sla,
        priority: 'HIGH',
        targetEntity: contract.capability,
      });
    }
  }

  return stableSort(constraints, c => c.id);
}

/**
 * Validates constraints for satisfiability
 */
function validateConstraints(
  constraints: readonly Constraint[]
): ConstraintValidationResult {
  const satisfiable: Constraint[] = [];
  const unsatisfiable: Constraint[] = [];
  const unknown: Constraint[] = [];

  for (const constraint of constraints) {
    // Simple validation logic - in a real system this would be more sophisticated
    if (isConstraintSatisfiable(constraint)) {
      satisfiable.push(constraint);
    } else if (isConstraintUnsatisfiable(constraint)) {
      unsatisfiable.push(constraint);
    } else {
      unknown.push(constraint);
    }
  }

  return { satisfiable, unsatisfiable, unknown };
}

/**
 * Checks if a constraint is satisfiable
 */
function isConstraintSatisfiable(constraint: Constraint): boolean {
  // Simple heuristics - real implementation would use constraint solver
  const spec = typeof constraint.specification === 'string'
    ? constraint.specification
    : JSON.stringify(constraint.specification);

  // SLA constraints are assumed satisfiable if reasonable
  if (constraint.type === 'SLA') {
    return true;
  }

  // Temporal constraints are satisfiable if they're in the future
  if (constraint.type === 'TEMPORAL') {
    return !spec.includes('impossible') && !spec.includes('past');
  }

  // Most constraints are assumed satisfiable by default
  return true;
}

/**
 * Checks if a constraint is unsatisfiable
 */
function isConstraintUnsatisfiable(constraint: Constraint): boolean {
  const spec = typeof constraint.specification === 'string'
    ? constraint.specification.toLowerCase()
    : JSON.stringify(constraint.specification).toLowerCase();

  // Constraints with contradictory terms
  return spec.includes('never') ||
         spec.includes('impossible') ||
         spec.includes('conflict');
}

/**
 * Detects conflicts between constraints
 */
function detectConflicts(
  constraints: readonly Constraint[],
  sessionId: UUID
): readonly ConstraintConflict[] {
  const conflicts: ConstraintConflict[] = [];

  // Check each pair of constraints for conflicts
  for (let i = 0; i < constraints.length; i++) {
    for (let j = i + 1; j < constraints.length; j++) {
      const c1 = constraints[i]!;
      const c2 = constraints[j]!;

      if (areConflicting(c1, c2)) {
        conflicts.push({
          id: generateDeterministicId('conflict', sessionId, c1.id, c2.id),
          constraint1: c1,
          constraint2: c2,
          conflictType: determineConflictType(c1, c2),
          severity: determineSeverity(c1, c2),
        });
      }
    }
  }

  return stableSort(conflicts, c => c.id);
}

/**
 * Checks if two constraints conflict
 */
function areConflicting(c1: Constraint, c2: Constraint): boolean {
  // Same target entity with incompatible constraints
  if (c1.targetEntity && c1.targetEntity === c2.targetEntity) {
    // Temporal conflicts
    if (c1.type === 'TEMPORAL' && c2.type === 'TEMPORAL') {
      return checkTemporalConflict(c1, c2);
    }

    // Resource conflicts
    if (c1.type === 'RESOURCE' && c2.type === 'RESOURCE') {
      return checkResourceConflict(c1, c2);
    }
  }

  return false;
}

/**
 * Checks for temporal conflict
 */
function checkTemporalConflict(c1: Constraint, c2: Constraint): boolean {
  // Simplified check - real implementation would parse temporal expressions
  const spec1 = String(c1.specification).toLowerCase();
  const spec2 = String(c2.specification).toLowerCase();

  // Check for mutually exclusive temporal constraints
  return (spec1.includes('before') && spec2.includes('after')) ||
         (spec1.includes('start') && spec2.includes('end'));
}

/**
 * Checks for resource conflict
 */
function checkResourceConflict(c1: Constraint, c2: Constraint): boolean {
  // Simplified check - real implementation would analyze resource requirements
  return false;
}

/**
 * Determines the type of conflict
 */
function determineConflictType(c1: Constraint, c2: Constraint): string {
  if (c1.type === c2.type) {
    return `SAME_TYPE_${c1.type}`;
  }
  return `CROSS_TYPE_${c1.type}_${c2.type}`;
}

/**
 * Determines conflict severity
 */
function determineSeverity(c1: Constraint, c2: Constraint): string {
  const p1 = PRIORITY_ORDER[c1.priority];
  const p2 = PRIORITY_ORDER[c2.priority];
  const maxPriority = Math.max(p1, p2);

  if (maxPriority >= 4) return 'CRITICAL';
  if (maxPriority >= 3) return 'HIGH';
  if (maxPriority >= 2) return 'MEDIUM';
  return 'LOW';
}

/**
 * Resolves conflicts between constraints
 */
function resolveConflicts(
  conflicts: readonly ConstraintConflict[]
): readonly Resolution[] {
  const resolutions: Resolution[] = [];

  for (const conflict of conflicts) {
    const resolution = resolveConflict(conflict);
    resolutions.push(resolution);
  }

  return resolutions;
}

/**
 * Resolves a single conflict
 */
function resolveConflict(conflict: ConstraintConflict): Resolution {
  const c1 = conflict.constraint1;
  const c2 = conflict.constraint2;

  // Priority-based resolution
  const p1 = PRIORITY_ORDER[c1.priority];
  const p2 = PRIORITY_ORDER[c2.priority];

  if (p1 !== p2) {
    return {
      conflictId: conflict.id,
      strategy: 'PRIORITY',
      winner: p1 > p2 ? c1 : c2,
      loser: p1 > p2 ? c2 : c1,
    };
  }

  // Type authority resolution
  const t1 = TYPE_AUTHORITY[c1.type];
  const t2 = TYPE_AUTHORITY[c2.type];

  if (t1 !== t2) {
    return {
      conflictId: conflict.id,
      strategy: 'SOURCE_AUTHORITY',
      winner: t1 > t2 ? c1 : c2,
      loser: t1 > t2 ? c2 : c1,
    };
  }

  // Conservative approach - keep more restrictive
  return {
    conflictId: conflict.id,
    strategy: 'CONSERVATIVE',
    winner: c1, // First constraint wins in tie
    loser: c2,
  };
}

/**
 * Creates ordered constraint set
 */
function createOrderedConstraintSet(
  constraints: readonly Constraint[],
  resolutions: readonly Resolution[]
): OrderedConstraintSet {
  // Remove losing constraints
  const losers = new Set(resolutions.map(r => r.loser?.id).filter(Boolean));
  const winners = constraints.filter(c => !losers.has(c.id));

  // Order by priority and type authority
  const ordered = stableSort(winners, c => {
    const priorityScore = PRIORITY_ORDER[c.priority] * 10;
    const typeScore = TYPE_AUTHORITY[c.type];
    return -(priorityScore + typeScore);
  });

  const ordering: [UUID, number][] = ordered.map((c, i) => [c.id, i + 1]);
  const hash = computeOrderingHash(ordered);

  return { constraints: ordered, ordering, hash };
}

/**
 * Resolves all constraints
 */
export async function resolveConstraints(
  intent: StructuredIntent,
  expanded: ExpandedAgentsAndWorkflows,
  integrationMap: IntegrationMap,
  sessionId: UUID,
  adapter: RuvvectorAdapter
): Promise<ResolvedConstraints> {
  const startTime = getCurrentTimestampUTC();

  // Collect all constraints
  const allConstraints = collectConstraints(intent, expanded, integrationMap, sessionId);

  // Validate constraints
  const validationResult = validateConstraints(allConstraints);

  // Check for unsatisfiable constraints
  if (validationResult.unsatisfiable.length > 0) {
    throw new ConstraintError({
      code: 'UNSATISFIABLE_CONSTRAINTS',
      message: `${validationResult.unsatisfiable.length} constraints cannot be satisfied`,
      severity: 'FATAL',
      constraints: validationResult.unsatisfiable,
    });
  }

  // Detect conflicts
  const conflicts = detectConflicts(allConstraints, sessionId);

  // Resolve conflicts
  const resolutions = resolveConflicts(conflicts);

  // Create ordered constraint set
  const orderedConstraints = createOrderedConstraintSet(allConstraints, resolutions);

  // Generate deterministic ID
  const resolvedId = generateDeterministicId(
    'resolved',
    sessionId,
    integrationMap.id
  );

  // Create resolved constraints
  const resolved: ResolvedConstraints = {
    id: resolvedId,
    integrationMapId: integrationMap.id,
    allConstraints,
    validationResult,
    conflicts,
    resolutions,
    orderedConstraints,
    resolutionStatus: conflicts.length === resolutions.length ? 'RESOLVED' : 'PENDING',
    timestamp: startTime,
  };

  // Store in ruvvector
  await adapter.store(
    `resolved:${resolvedId}`,
    resolved,
    { stage: 'CONSTRAINT_RESOLUTION', type: 'resolved_constraints' }
  );

  // Create relation to integration map
  await adapter.createRelation(
    resolvedId,
    integrationMap.id,
    'RESOLVED_FROM',
    { stage: 'CONSTRAINT_RESOLUTION' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'CONSTRAINT_RESOLUTION',
    operation: 'RESOLVE',
    inputId: integrationMap.id,
    outputId: resolvedId,
    timestamp: getCurrentTimestampUTC(),
    decision: conflicts.length === 0 ? 'NO_CONFLICTS' : 'CONFLICTS_RESOLVED',
    metrics: {
      totalConstraints: allConstraints.length,
      satisfiableCount: validationResult.satisfiable.length,
      conflictCount: conflicts.length,
      resolutionCount: resolutions.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return resolved;
}
