/**
 * Stage 2: Intent Decomposition Module
 * Decomposes parsed objectives into atomic, dependency-ordered objectives.
 * Produces a directed acyclic graph of execution dependencies.
 */

import type {
  UUID,
  StructuredIntent,
  AtomicObjective,
  DecomposedIntent,
  ImplicitRequirement,
  DependencyGraphData,
  ParsedObjective,
  ObjectiveConstraint,
  ActionComplexity,
  Priority,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { DecompositionError } from '../types/errors.js';
import { generateDeterministicId, computeDecompositionHash } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Decomposition patterns for different action types */
interface DecompositionPattern {
  readonly action: string;
  readonly subActions: readonly string[];
  readonly dependencies: readonly [number, number][];
}

/** Common decomposition patterns */
const DECOMPOSITION_PATTERNS: readonly DecompositionPattern[] = [
  {
    action: 'optimize',
    subActions: ['analyze', 'identify_bottlenecks', 'implement_improvements', 'validate'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'reduce',
    subActions: ['measure_current', 'identify_reduction_targets', 'implement_reduction', 'verify'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'deploy',
    subActions: ['prepare', 'configure', 'deploy', 'validate'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'implement',
    subActions: ['design', 'develop', 'test', 'deploy'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'improve',
    subActions: ['assess', 'plan_improvements', 'execute', 'measure'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'automate',
    subActions: ['document_process', 'design_automation', 'implement', 'validate'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'scale',
    subActions: ['assess_capacity', 'plan_scaling', 'execute_scaling', 'verify'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
  {
    action: 'transform',
    subActions: ['assess_current', 'design_target', 'migrate', 'validate'],
    dependencies: [[0, 1], [1, 2], [2, 3]],
  },
];

/**
 * Finds the decomposition pattern for an action
 */
function findPattern(action: string): DecompositionPattern | null {
  const normalized = action.toLowerCase();
  return DECOMPOSITION_PATTERNS.find(p => normalized.includes(p.action)) ?? null;
}

/**
 * Determines the complexity of an action
 */
function determineComplexity(
  objective: ParsedObjective,
  pattern: DecompositionPattern | null
): ActionComplexity {
  if (!pattern) {
    return 'SIMPLE';
  }

  if (objective.targets.length > 3 || objective.modifiers.length > 5) {
    return 'HIERARCHICAL';
  }

  return 'COMPOUND';
}

/**
 * Decomposes a single parsed objective into atomic objectives
 */
function decomposeObjective(
  objective: ParsedObjective,
  parentId: UUID,
  sessionId: UUID,
  index: number
): readonly AtomicObjective[] {
  const pattern = findPattern(objective.action);
  const complexity = determineComplexity(objective, pattern);

  if (complexity === 'SIMPLE' || !pattern) {
    // No decomposition needed
    const atomicId = generateDeterministicId(
      'atomic',
      sessionId,
      parentId,
      String(index),
      objective.action
    );

    return [{
      id: atomicId,
      action: objective.action,
      targets: objective.targets,
      constraints: objective.constraints,
      parent: objective,
      isLeaf: true,
      complexity,
    }];
  }

  // Decompose into sub-actions
  const atomics: AtomicObjective[] = [];

  for (let i = 0; i < pattern.subActions.length; i++) {
    const subAction = pattern.subActions[i];
    if (!subAction) continue;

    const atomicId = generateDeterministicId(
      'atomic',
      sessionId,
      parentId,
      String(index),
      objective.action,
      String(i)
    );

    atomics.push({
      id: atomicId,
      action: subAction,
      targets: objective.targets,
      constraints: objective.constraints.filter(c =>
        c.type !== 'TEMPORAL' || i === pattern.subActions.length - 1
      ),
      parent: objective,
      phase: i + 1,
      isLeaf: true,
      complexity: 'SIMPLE',
    });
  }

  return atomics;
}

/**
 * Builds dependency graph from atomic objectives
 */
function buildDependencyGraph(
  atomicObjectives: readonly AtomicObjective[],
  sessionId: UUID
): DependencyGraphData {
  const nodes = atomicObjectives.map(obj => ({
    id: obj.id,
    data: obj,
  }));

  const edges: { from: UUID; to: UUID; weight: number }[] = [];

  // Group by parent objective
  const byParent = new Map<ParsedObjective, AtomicObjective[]>();
  for (const obj of atomicObjectives) {
    const existing = byParent.get(obj.parent) ?? [];
    existing.push(obj);
    byParent.set(obj.parent, existing);
  }

  // Create edges based on phases within each parent group
  for (const [, group] of byParent) {
    const sorted = stableSort(group, obj => obj.phase ?? 0);
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (current && next) {
        edges.push({
          from: current.id,
          to: next.id,
          weight: 1,
        });
      }
    }
  }

  // Add cross-objective dependencies based on constraint analysis
  // (e.g., if objective B requires resources from objective A)

  return { nodes, edges };
}

/**
 * Computes execution order using topological sort
 */
function computeExecutionOrder(graph: DependencyGraphData): readonly UUID[] {
  const inDegree = new Map<UUID, number>();
  const adjacency = new Map<UUID, UUID[]>();

  // Initialize
  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency and in-degree
  for (const edge of graph.edges) {
    const neighbors = adjacency.get(edge.from) ?? [];
    neighbors.push(edge.to);
    adjacency.set(edge.from, neighbors);

    const degree = inDegree.get(edge.to) ?? 0;
    inDegree.set(edge.to, degree + 1);
  }

  // Kahn's algorithm for topological sort
  const queue: UUID[] = [];
  const order: UUID[] = [];

  // Start with nodes that have no dependencies
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // Sort queue for determinism
  queue.sort();

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const degree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, degree);
      if (degree === 0) {
        // Insert in sorted order for determinism
        let insertIndex = 0;
        while (insertIndex < queue.length && queue[insertIndex]! < neighbor) {
          insertIndex++;
        }
        queue.splice(insertIndex, 0, neighbor);
      }
    }
  }

  // Check for cycles
  if (order.length !== graph.nodes.length) {
    const missing = graph.nodes
      .filter(n => !order.includes(n.id))
      .map(n => n.id);
    throw new DecompositionError({
      code: 'CYCLE_DETECTED',
      message: 'Dependency graph contains cycles',
      severity: 'FATAL',
      cycles: [missing],
    });
  }

  return order;
}

/**
 * Discovers implicit requirements from objectives
 */
function discoverImplicitRequirements(
  atomicObjectives: readonly AtomicObjective[],
  sessionId: UUID
): readonly ImplicitRequirement[] {
  const requirements: ImplicitRequirement[] = [];

  for (const obj of atomicObjectives) {
    // Check for resource prerequisites
    if (obj.action.includes('deploy') || obj.action.includes('scale')) {
      requirements.push({
        type: 'RESOURCE_PREREQUISITE',
        resource: 'compute_capacity',
        requiredBy: obj.id,
        reason: `Action '${obj.action}' requires compute resources`,
      });
    }

    // Check for capability prerequisites
    if (obj.action.includes('automate')) {
      requirements.push({
        type: 'CAPABILITY_PREREQUISITE',
        capability: 'automation_framework',
        requiredBy: obj.id,
        reason: `Action '${obj.action}' requires automation capability`,
      });
    }

    // Check for authorization prerequisites
    for (const constraint of obj.constraints) {
      if (constraint.type === 'AUTHORIZATION' || constraint.type === 'SLA') {
        requirements.push({
          type: 'AUTHORIZATION_PREREQUISITE',
          authorization: {
            level: constraint.priority === 'CRITICAL' ? 'executive' : 'management',
            scope: constraint.targetEntity ?? 'organization',
          },
          requiredBy: obj.id,
          reason: `Constraint '${constraint.specification}' requires authorization`,
        });
      }
    }
  }

  return requirements;
}

/**
 * Decomposes structured intent into atomic objectives
 */
export async function decomposeIntent(
  intent: StructuredIntent,
  adapter: RuvvectorAdapter
): Promise<DecomposedIntent> {
  const startTime = getCurrentTimestampUTC();

  // Decompose each parsed objective
  const allAtomics: AtomicObjective[] = [];
  let index = 0;

  for (const objective of intent.components.objectives) {
    const atomics = decomposeObjective(
      objective,
      intent.id,
      intent.sessionId,
      index++
    );
    allAtomics.push(...atomics);
  }

  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(allAtomics, intent.sessionId);

  // Compute execution order
  const executionOrder = computeExecutionOrder(dependencyGraph);

  // Discover implicit requirements
  const implicitRequirements = discoverImplicitRequirements(allAtomics, intent.sessionId);

  // Generate deterministic ID
  const decomposedId = generateDeterministicId(
    'decomposed',
    intent.sessionId,
    intent.id
  );

  // Compute decomposition hash
  const decompositionHash = computeDecompositionHash({
    atomicObjectives: allAtomics,
    executionOrder,
  });

  // Create decomposed intent
  const decomposedIntent: DecomposedIntent = {
    id: decomposedId,
    sourceIntentId: intent.id,
    atomicObjectives: allAtomics,
    dependencyGraph,
    executionOrder,
    implicitRequirements,
    decompositionHash,
    timestamp: startTime,
  };

  // Store in ruvvector
  await adapter.store(
    `decomposed:${decomposedId}`,
    decomposedIntent,
    { stage: 'INTENT_DECOMPOSITION', type: 'decomposed_intent' }
  );

  // Create relation to source intent
  await adapter.createRelation(
    decomposedId,
    intent.id,
    'DERIVED_FROM',
    { stage: 'INTENT_DECOMPOSITION' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'INTENT_DECOMPOSITION',
    operation: 'DECOMPOSE',
    inputId: intent.id,
    outputId: decomposedId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'SUCCESS',
    metrics: {
      atomicObjectiveCount: allAtomics.length,
      dependencyEdgeCount: dependencyGraph.edges.length,
      implicitRequirementCount: implicitRequirements.length,
    },
  };
  await adapter.appendAudit(intent.sessionId, auditEntry);

  return decomposedIntent;
}
