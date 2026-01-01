/**
 * Stage 4: Agent and Workflow Expansion Module
 * Expands agent archetypes into concrete specifications and workflows.
 */

import type {
  UUID,
  DecomposedIntent,
  OrganizationalTopologyModel,
  ExpandedAgentsAndWorkflows,
  AgentSpecification,
  WorkflowDefinition,
  WorkflowStep,
  InterAgentDependencyMap,
  InterAgentDependency,
  CapabilityValidationResult,
  ValidationIssue,
  ResourceRequirements,
  CommunicationEndpoint,
  StepInput,
  StepOutput,
  StepCondition,
  ParallelizationStrategy,
  AtomicObjective,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { ExpansionError } from '../types/errors.js';
import { generateDeterministicId } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Registered capabilities for validation */
const REGISTERED_CAPABILITIES = new Set([
  'data_analysis',
  'reporting',
  'visualization',
  'coordination',
  'scheduling',
  'resource_allocation',
  'task_execution',
  'process_automation',
  'data_processing',
  'validation',
  'quality_assurance',
  'compliance_check',
  'optimization',
  'performance_tuning',
  'bottleneck_analysis',
  'integration',
  'api_management',
  'data_transformation',
]);

/** Default resource requirements by capability count */
function computeResourceRequirements(capabilities: readonly string[]): ResourceRequirements {
  const baseMemory = 256; // MB
  const baseCpu = 0.25; // cores
  const capabilityFactor = capabilities.length;

  return {
    cpu: Math.round(baseCpu * (1 + capabilityFactor * 0.1) * 100) / 100,
    memory: Math.round(baseMemory * (1 + capabilityFactor * 0.2)),
    storage: 100, // MB
  };
}

/**
 * Expands agent archetype mappings into concrete specifications
 */
function expandAgentSpecifications(
  topology: OrganizationalTopologyModel,
  decomposed: DecomposedIntent,
  sessionId: UUID
): readonly AgentSpecification[] {
  const agents: AgentSpecification[] = [];
  let agentIndex = 0;

  // Create agents from archetype mappings
  for (const mapping of topology.agentArchetypeMappings) {
    for (let i = 0; i < mapping.instanceCount; i++) {
      const agentId = generateDeterministicId(
        'agent',
        sessionId,
        mapping.teamId,
        mapping.role,
        String(i)
      );

      // Map communication patterns to endpoints
      const endpoints: CommunicationEndpoint[] = mapping.communicationPatterns.map(p => ({
        protocol: p.protocol,
        direction: p.direction,
        messageTypes: p.messageTypes,
      }));

      // Assign objectives based on capabilities
      const assignedObjectives = findMatchingObjectives(
        mapping.capabilities,
        decomposed.atomicObjectives
      );

      agents.push({
        id: agentId,
        name: `${mapping.archetypeName}_${mapping.role}_${i + 1}`,
        archetypeId: mapping.archetypeId,
        teamId: mapping.teamId,
        role: mapping.role,
        capabilities: mapping.capabilities,
        communicationEndpoints: endpoints,
        assignedObjectives,
        resourceRequirements: computeResourceRequirements(mapping.capabilities),
      });

      agentIndex++;
    }
  }

  return stableSort(agents, a => a.id);
}

/**
 * Finds objectives that match agent capabilities
 */
function findMatchingObjectives(
  capabilities: readonly string[],
  objectives: readonly AtomicObjective[]
): readonly UUID[] {
  const matches: UUID[] = [];

  for (const objective of objectives) {
    // Simple capability matching based on action keywords
    const actionLower = objective.action.toLowerCase();

    for (const cap of capabilities) {
      const capLower = cap.toLowerCase();
      if (actionLower.includes(capLower.replace('_', ' ')) ||
          capLower.includes(actionLower)) {
        matches.push(objective.id);
        break;
      }
    }
  }

  return matches;
}

/**
 * Creates workflow definitions from objectives and agents
 */
function createWorkflowDefinitions(
  decomposed: DecomposedIntent,
  agents: readonly AgentSpecification[],
  sessionId: UUID
): readonly WorkflowDefinition[] {
  const workflows: WorkflowDefinition[] = [];

  // Group objectives by phase
  const objectivesByPhase = new Map<number, AtomicObjective[]>();
  for (const obj of decomposed.atomicObjectives) {
    const phase = obj.phase ?? 1;
    const existing = objectivesByPhase.get(phase) ?? [];
    existing.push(obj);
    objectivesByPhase.set(phase, existing);
  }

  // Create one workflow per phase
  const phases = Array.from(objectivesByPhase.keys()).sort();

  for (const phase of phases) {
    const phaseObjectives = objectivesByPhase.get(phase) ?? [];
    const workflowId = generateDeterministicId(
      'workflow',
      sessionId,
      String(phase)
    );

    const steps = createWorkflowSteps(
      phaseObjectives,
      agents,
      workflowId,
      decomposed.executionOrder,
      sessionId
    );

    // Determine parallelization strategy
    const parallelization = determineParallelization(phaseObjectives, decomposed);

    workflows.push({
      id: workflowId,
      name: `Phase_${phase}_Workflow`,
      objectives: phaseObjectives.map(o => o.id),
      steps,
      parallelizationStrategy: parallelization,
    });
  }

  return workflows;
}

/**
 * Creates workflow steps for a set of objectives
 */
function createWorkflowSteps(
  objectives: readonly AtomicObjective[],
  agents: readonly AgentSpecification[],
  workflowId: UUID,
  executionOrder: readonly UUID[],
  sessionId: UUID
): readonly WorkflowStep[] {
  const steps: WorkflowStep[] = [];

  // Sort objectives by execution order
  const sortedObjectives = stableSort(objectives, o =>
    executionOrder.indexOf(o.id)
  );

  for (let i = 0; i < sortedObjectives.length; i++) {
    const objective = sortedObjectives[i]!;

    // Find best matching agent
    const assignedAgent = findBestAgent(objective, agents);
    if (!assignedAgent) {
      throw new ExpansionError({
        code: 'NO_MATCHING_AGENT',
        message: `No agent found for objective: ${objective.action}`,
        objective,
      });
    }

    const stepId = generateDeterministicId(
      'step',
      sessionId,
      workflowId,
      String(i)
    );

    // Create inputs (from previous step if not first)
    const inputs: StepInput[] = [];
    if (i > 0) {
      const prevStep = steps[i - 1];
      if (prevStep && prevStep.outputs.length > 0) {
        inputs.push({
          sourceStepId: prevStep.id,
          dataType: prevStep.outputs[0]?.dataType ?? 'result',
        });
      }
    } else {
      inputs.push({
        sourceStepId: null,
        dataType: 'initial_input',
      });
    }

    // Create outputs
    const outputs: StepOutput[] = [{
      name: `${objective.action}_result`,
      dataType: 'result',
    }];

    // Create conditions from constraints
    const preconditions: StepCondition[] = objective.constraints
      .filter(c => c.type === 'PRECONDITION' || c.type === 'REQUIRES')
      .map(c => ({
        type: c.type,
        specification: c.specification,
      }));

    const postconditions: StepCondition[] = objective.constraints
      .filter(c => c.type === 'POSTCONDITION')
      .map(c => ({
        type: c.type,
        specification: c.specification,
      }));

    steps.push({
      id: stepId,
      order: i,
      objectiveId: objective.id,
      assignedAgentId: assignedAgent.id,
      inputs,
      outputs,
      preconditions,
      postconditions,
    });
  }

  return steps;
}

/**
 * Finds the best matching agent for an objective
 */
function findBestAgent(
  objective: AtomicObjective,
  agents: readonly AgentSpecification[]
): AgentSpecification | null {
  let bestAgent: AgentSpecification | null = null;
  let bestScore = 0;

  for (const agent of agents) {
    let score = 0;

    // Check if objective is already assigned
    if (agent.assignedObjectives.includes(objective.id)) {
      score += 10;
    }

    // Check capability match
    for (const cap of agent.capabilities) {
      if (objective.action.toLowerCase().includes(cap.replace('_', ' '))) {
        score += 5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  // Return first agent if no better match found
  return bestAgent ?? agents[0] ?? null;
}

/**
 * Determines the parallelization strategy for a workflow
 */
function determineParallelization(
  objectives: readonly AtomicObjective[],
  decomposed: DecomposedIntent
): ParallelizationStrategy {
  if (objectives.length === 1) {
    return 'NONE';
  }

  // Check if objectives have dependencies between them
  const objectiveIds = new Set(objectives.map(o => o.id));
  const hasDependencies = decomposed.dependencyGraph.edges.some(
    e => objectiveIds.has(e.from) && objectiveIds.has(e.to)
  );

  if (hasDependencies) {
    return 'ADAPTIVE';
  }

  return 'STEP_LEVEL';
}

/**
 * Builds inter-agent dependency map
 */
function buildInterAgentDependencies(
  workflows: readonly WorkflowDefinition[]
): InterAgentDependencyMap {
  const dependencies: InterAgentDependency[] = [];

  for (const workflow of workflows) {
    for (let i = 0; i < workflow.steps.length - 1; i++) {
      const currentStep = workflow.steps[i]!;
      const nextStep = workflow.steps[i + 1]!;

      if (currentStep.assignedAgentId !== nextStep.assignedAgentId) {
        dependencies.push({
          fromAgentId: currentStep.assignedAgentId,
          toAgentId: nextStep.assignedAgentId,
          dataFlow: currentStep.outputs[0]?.dataType ?? 'result',
          workflowId: workflow.id,
          fromStepId: currentStep.id,
          toStepId: nextStep.id,
        });
      }
    }
  }

  return { dependencies: stableSort(dependencies, d => [d.fromAgentId, d.toAgentId]) };
}

/**
 * Validates agent capabilities against registry
 */
function validateCapabilities(
  agents: readonly AgentSpecification[]
): CapabilityValidationResult {
  const issues: ValidationIssue[] = [];

  for (const agent of agents) {
    for (const cap of agent.capabilities) {
      if (!REGISTERED_CAPABILITIES.has(cap)) {
        issues.push({
          type: 'UNREGISTERED_CAPABILITY',
          agentId: agent.id,
          capability: cap,
          severity: 'WARNING',
        });
      }
    }

    // Check if agent has any valid capabilities
    const validCaps = agent.capabilities.filter(c => REGISTERED_CAPABILITIES.has(c));
    if (validCaps.length === 0) {
      issues.push({
        type: 'MISSING_CAPABILITY',
        agentId: agent.id,
        capability: 'none',
        severity: 'ERROR',
      });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'ERROR').length === 0,
    issues,
  };
}

/**
 * Expands agents and workflows from topology and decomposed intent
 */
export async function expandAgentsAndWorkflows(
  decomposed: DecomposedIntent,
  topology: OrganizationalTopologyModel,
  sessionId: UUID,
  adapter: RuvvectorAdapter
): Promise<ExpandedAgentsAndWorkflows> {
  const startTime = getCurrentTimestampUTC();

  // Expand agent specifications
  const agentSpecifications = expandAgentSpecifications(topology, decomposed, sessionId);

  if (agentSpecifications.length === 0) {
    throw new ExpansionError({
      code: 'NO_AGENTS_CREATED',
      message: 'No agents could be created from the organizational topology',
    });
  }

  // Create workflow definitions
  const workflowDefinitions = createWorkflowDefinitions(
    decomposed,
    agentSpecifications,
    sessionId
  );

  // Build inter-agent dependencies
  const interAgentDependencies = buildInterAgentDependencies(workflowDefinitions);

  // Validate capabilities
  const capabilityValidation = validateCapabilities(agentSpecifications);

  // Generate deterministic ID
  const expandedId = generateDeterministicId(
    'expanded',
    sessionId,
    decomposed.id,
    topology.id
  );

  // Create expanded result
  const expanded: ExpandedAgentsAndWorkflows = {
    id: expandedId,
    topologyId: topology.id,
    decomposedIntentId: decomposed.id,
    agentSpecifications,
    workflowDefinitions,
    interAgentDependencies,
    capabilityValidation,
    timestamp: startTime,
  };

  // Store in ruvvector
  await adapter.store(
    `expanded:${expandedId}`,
    expanded,
    { stage: 'AGENT_WORKFLOW_EXPANSION', type: 'expanded_agents_workflows' }
  );

  // Create relations
  await adapter.createRelation(
    expandedId,
    topology.id,
    'EXPANDED_FROM_TOPOLOGY',
    { stage: 'AGENT_WORKFLOW_EXPANSION' }
  );
  await adapter.createRelation(
    expandedId,
    decomposed.id,
    'EXPANDED_FROM_DECOMPOSED',
    { stage: 'AGENT_WORKFLOW_EXPANSION' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'AGENT_WORKFLOW_EXPANSION',
    operation: 'EXPAND',
    inputIds: [decomposed.id, topology.id],
    outputId: expandedId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'SUCCESS',
    metrics: {
      agentCount: agentSpecifications.length,
      workflowCount: workflowDefinitions.length,
      stepCount: workflowDefinitions.reduce((sum, w) => sum + w.steps.length, 0),
      dependencyCount: interAgentDependencies.dependencies.length,
      validationIssueCount: capabilityValidation.issues.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return expanded;
}
