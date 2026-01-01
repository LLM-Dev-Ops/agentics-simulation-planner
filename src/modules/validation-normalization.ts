/**
 * Stage 7: Validation and Normalization Module
 * Validates all outputs against SimulationPlan schema and normalizes data.
 */

import type {
  UUID,
  ExpandedAgentsAndWorkflows,
  ResolvedConstraints,
  NormalizedPlan,
  SchemaValidationResult,
  SemanticValidationResult,
  SchemaError,
  SemanticIssue,
  NormalizedDataStructures,
  ValidationReport,
  AgentSpecification,
  WorkflowDefinition,
  InterAgentDependency,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { SchemaValidationError, SemanticValidationError } from '../types/errors.js';
import { generateDeterministicId } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Schema version */
const SCHEMA_VERSION = '2.0.0';
const VALIDATOR_VERSION = '1.0.0';

/**
 * Validates agents against schema
 */
function validateAgentSchema(
  agent: AgentSpecification,
  index: number
): readonly SchemaError[] {
  const errors: SchemaError[] = [];

  // Required fields
  if (!agent.id) {
    errors.push({
      entity: 'Agent',
      entityId: agent.id ?? `unknown_${index}`,
      path: 'id',
      message: 'Agent ID is required',
    });
  }

  if (!agent.name) {
    errors.push({
      entity: 'Agent',
      entityId: agent.id,
      path: 'name',
      message: 'Agent name is required',
    });
  }

  if (!agent.capabilities || agent.capabilities.length === 0) {
    errors.push({
      entity: 'Agent',
      entityId: agent.id,
      path: 'capabilities',
      message: 'Agent must have at least one capability',
    });
  }

  // Type validation
  if (typeof agent.id !== 'string') {
    errors.push({
      entity: 'Agent',
      entityId: String(agent.id),
      path: 'id',
      message: 'Agent ID must be a string',
    });
  }

  // UUID format validation
  if (agent.id && !isValidUUID(agent.id)) {
    errors.push({
      entity: 'Agent',
      entityId: agent.id,
      path: 'id',
      message: 'Agent ID must be a valid UUID',
    });
  }

  return errors;
}

/**
 * Validates workflows against schema
 */
function validateWorkflowSchema(
  workflow: WorkflowDefinition,
  index: number
): readonly SchemaError[] {
  const errors: SchemaError[] = [];

  // Required fields
  if (!workflow.id) {
    errors.push({
      entity: 'Workflow',
      entityId: workflow.id ?? `unknown_${index}`,
      path: 'id',
      message: 'Workflow ID is required',
    });
  }

  if (!workflow.name) {
    errors.push({
      entity: 'Workflow',
      entityId: workflow.id,
      path: 'name',
      message: 'Workflow name is required',
    });
  }

  if (!workflow.steps || workflow.steps.length === 0) {
    errors.push({
      entity: 'Workflow',
      entityId: workflow.id,
      path: 'steps',
      message: 'Workflow must have at least one step',
    });
  }

  // Validate each step
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    if (!step.id) {
      errors.push({
        entity: 'Workflow',
        entityId: workflow.id,
        path: `steps[${i}].id`,
        message: 'Step ID is required',
      });
    }
    if (!step.assignedAgentId) {
      errors.push({
        entity: 'Workflow',
        entityId: workflow.id,
        path: `steps[${i}].assignedAgentId`,
        message: 'Step must have an assigned agent',
      });
    }
  }

  return errors;
}

/**
 * Validates constraints against schema
 */
function validateConstraintSchema(
  constraints: ResolvedConstraints
): readonly SchemaError[] {
  const errors: SchemaError[] = [];

  for (const constraint of constraints.orderedConstraints.constraints) {
    if (!constraint.id) {
      errors.push({
        entity: 'Constraint',
        entityId: 'unknown',
        path: 'id',
        message: 'Constraint ID is required',
      });
    }

    if (!constraint.type) {
      errors.push({
        entity: 'Constraint',
        entityId: constraint.id ?? 'unknown',
        path: 'type',
        message: 'Constraint type is required',
      });
    }
  }

  return errors;
}

/**
 * Performs schema validation on all entities
 */
function validateSchema(
  expanded: ExpandedAgentsAndWorkflows,
  constraints: ResolvedConstraints
): SchemaValidationResult {
  const errors: SchemaError[] = [];
  const warnings: SchemaError[] = [];

  // Validate agents
  for (let i = 0; i < expanded.agentSpecifications.length; i++) {
    const agent = expanded.agentSpecifications[i]!;
    errors.push(...validateAgentSchema(agent, i));
  }

  // Validate workflows
  for (let i = 0; i < expanded.workflowDefinitions.length; i++) {
    const workflow = expanded.workflowDefinitions[i]!;
    errors.push(...validateWorkflowSchema(workflow, i));
  }

  // Validate constraints
  errors.push(...validateConstraintSchema(constraints));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks semantic consistency
 */
function validateSemantics(
  expanded: ExpandedAgentsAndWorkflows
): SemanticValidationResult {
  const issues: SemanticIssue[] = [];

  // Build sets of valid IDs
  const agentIds = new Set(expanded.agentSpecifications.map(a => a.id));
  const workflowIds = new Set(expanded.workflowDefinitions.map(w => w.id));
  const stepIds = new Set<UUID>();
  const objectiveIds = new Set<UUID>();

  for (const workflow of expanded.workflowDefinitions) {
    for (const step of workflow.steps) {
      stepIds.add(step.id);
      objectiveIds.add(step.objectiveId);
    }
  }

  // Check for invalid agent references in workflows
  for (const workflow of expanded.workflowDefinitions) {
    for (const step of workflow.steps) {
      if (!agentIds.has(step.assignedAgentId)) {
        issues.push({
          type: 'INVALID_REFERENCE',
          location: `workflow:${workflow.id}:step:${step.id}`,
          message: `Step references non-existent agent: ${step.assignedAgentId}`,
        });
      }
    }
  }

  // Check for invalid step references in inputs
  for (const workflow of expanded.workflowDefinitions) {
    for (const step of workflow.steps) {
      for (const input of step.inputs) {
        if (input.sourceStepId && !stepIds.has(input.sourceStepId)) {
          issues.push({
            type: 'INVALID_REFERENCE',
            location: `workflow:${workflow.id}:step:${step.id}:input`,
            message: `Input references non-existent step: ${input.sourceStepId}`,
          });
        }
      }
    }
  }

  // Check for duplicate IDs
  const allIds = new Set<UUID>();
  for (const agent of expanded.agentSpecifications) {
    if (allIds.has(agent.id)) {
      issues.push({
        type: 'DUPLICATE_ID',
        location: `agent:${agent.id}`,
        message: `Duplicate ID found: ${agent.id}`,
      });
    }
    allIds.add(agent.id);
  }

  for (const workflow of expanded.workflowDefinitions) {
    if (allIds.has(workflow.id)) {
      issues.push({
        type: 'DUPLICATE_ID',
        location: `workflow:${workflow.id}`,
        message: `Duplicate ID found: ${workflow.id}`,
      });
    }
    allIds.add(workflow.id);
  }

  // Check for orphaned constraints
  // (constraints that reference non-existent entities)
  // This would require the resolved constraints to be passed in

  return {
    consistent: issues.length === 0,
    issues,
  };
}

/**
 * Normalizes agent specifications
 */
function normalizeAgents(
  agents: readonly AgentSpecification[]
): readonly AgentSpecification[] {
  return stableSort(agents, a => a.id).map(agent => ({
    ...agent,
    name: agent.name.trim(),
    capabilities: stableSort([...agent.capabilities], c => c),
  }));
}

/**
 * Normalizes workflow definitions
 */
function normalizeWorkflows(
  workflows: readonly WorkflowDefinition[]
): readonly WorkflowDefinition[] {
  return stableSort(workflows, w => w.id).map(workflow => ({
    ...workflow,
    name: workflow.name.trim(),
    objectives: stableSort([...workflow.objectives], o => o),
    steps: stableSort([...workflow.steps], s => s.order),
  }));
}

/**
 * Normalizes dependencies
 */
function normalizeDependencies(
  dependencies: readonly InterAgentDependency[]
): readonly InterAgentDependency[] {
  return stableSort(dependencies, d => [d.fromAgentId, d.toAgentId]);
}

/**
 * Creates normalized data structures
 */
function normalize(
  expanded: ExpandedAgentsAndWorkflows
): NormalizedDataStructures {
  return {
    agents: normalizeAgents(expanded.agentSpecifications),
    workflows: normalizeWorkflows(expanded.workflowDefinitions),
    dependencies: normalizeDependencies(expanded.interAgentDependencies.dependencies),
  };
}

/**
 * Validates a UUID format
 */
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Validates and normalizes the plan
 */
export async function validateAndNormalize(
  expanded: ExpandedAgentsAndWorkflows,
  constraints: ResolvedConstraints,
  sessionId: UUID,
  adapter: RuvvectorAdapter
): Promise<NormalizedPlan> {
  const startTime = getCurrentTimestampUTC();

  // Perform schema validation
  const schemaValidation = validateSchema(expanded, constraints);

  if (!schemaValidation.valid) {
    throw new SchemaValidationError({
      code: 'SCHEMA_VALIDATION_FAILED',
      message: `Schema validation failed with ${schemaValidation.errors.length} errors`,
      errors: schemaValidation.errors,
    });
  }

  // Perform semantic validation
  const semanticValidation = validateSemantics(expanded);

  if (!semanticValidation.consistent) {
    throw new SemanticValidationError({
      code: 'SEMANTIC_VALIDATION_FAILED',
      message: `Semantic validation failed with ${semanticValidation.issues.length} issues`,
      issues: semanticValidation.issues,
    });
  }

  // Normalize data structures
  const normalizedStructures = normalize(expanded);

  // Create validation report
  const validationReport: ValidationReport = {
    schemaValidation,
    semanticValidation,
    normalizationApplied: true,
    timestamp: startTime,
    validatorVersion: VALIDATOR_VERSION,
  };

  // Generate deterministic ID
  const normalizedId = generateDeterministicId(
    'normalized',
    sessionId,
    constraints.id,
    expanded.id
  );

  // Create normalized plan
  const normalizedPlan: NormalizedPlan = {
    id: normalizedId,
    constraintsId: constraints.id,
    expandedId: expanded.id,
    schemaValidation,
    semanticValidation,
    normalizedStructures,
    validationReport,
    validationStatus: 'VALID',
    timestamp: startTime,
  };

  // Store in ruvvector
  await adapter.store(
    `normalized:${normalizedId}`,
    normalizedPlan,
    { stage: 'VALIDATION_NORMALIZATION', type: 'normalized_plan' }
  );

  // Create relations
  await adapter.createRelation(
    normalizedId,
    constraints.id,
    'VALIDATED_FROM_CONSTRAINTS',
    { stage: 'VALIDATION_NORMALIZATION' }
  );
  await adapter.createRelation(
    normalizedId,
    expanded.id,
    'VALIDATED_FROM_EXPANDED',
    { stage: 'VALIDATION_NORMALIZATION' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'VALIDATION_NORMALIZATION',
    operation: 'VALIDATE_NORMALIZE',
    inputIds: [constraints.id, expanded.id],
    outputId: normalizedId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'VALID',
    metrics: {
      schemaErrorCount: schemaValidation.errors.length,
      schemaWarningCount: schemaValidation.warnings.length,
      semanticIssueCount: semanticValidation.issues.length,
      agentCount: normalizedStructures.agents.length,
      workflowCount: normalizedStructures.workflows.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return normalizedPlan;
}
