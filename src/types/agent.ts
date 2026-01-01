/**
 * Agent and workflow type definitions
 * Defines structures for agent specifications and workflow definitions.
 */

import type {
  UUID,
  Timestamp,
  CommunicationProtocol,
  CommunicationDirection,
  ParallelizationStrategy,
} from './common.js';
import type { ObjectiveConstraint } from './intent.js';

/** Communication endpoint for an agent */
export interface CommunicationEndpoint {
  readonly protocol: CommunicationProtocol;
  readonly direction: CommunicationDirection;
  readonly messageTypes: readonly string[];
}

/** Resource requirements for an agent */
export interface ResourceRequirements {
  readonly cpu?: number;
  readonly memory?: number;
  readonly storage?: number;
  readonly network?: number;
  readonly custom?: Record<string, number>;
}

/** Agent specification */
export interface AgentSpecification {
  readonly id: UUID;
  readonly name: string;
  readonly archetypeId: UUID;
  readonly teamId: UUID;
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly communicationEndpoints: readonly CommunicationEndpoint[];
  readonly assignedObjectives: readonly UUID[];
  readonly resourceRequirements: ResourceRequirements;
}

/** Input to a workflow step */
export interface StepInput {
  readonly sourceStepId: UUID | null;
  readonly dataType: string;
}

/** Output from a workflow step */
export interface StepOutput {
  readonly name: string;
  readonly dataType: string;
}

/** Condition for workflow step execution */
export interface StepCondition {
  readonly type: string;
  readonly specification: string;
}

/** Workflow step definition */
export interface WorkflowStep {
  readonly id: UUID;
  readonly order: number;
  readonly objectiveId: UUID;
  readonly assignedAgentId: UUID;
  readonly inputs: readonly StepInput[];
  readonly outputs: readonly StepOutput[];
  readonly preconditions: readonly StepCondition[];
  readonly postconditions: readonly StepCondition[];
}

/** Workflow definition */
export interface WorkflowDefinition {
  readonly id: UUID;
  readonly name: string;
  readonly objectives: readonly UUID[];
  readonly steps: readonly WorkflowStep[];
  readonly parallelizationStrategy: ParallelizationStrategy;
}

/** Inter-agent dependency */
export interface InterAgentDependency {
  readonly fromAgentId: UUID;
  readonly toAgentId: UUID;
  readonly dataFlow: string;
  readonly workflowId: UUID;
  readonly fromStepId: UUID;
  readonly toStepId: UUID;
}

/** Inter-agent dependency map */
export interface InterAgentDependencyMap {
  readonly dependencies: readonly InterAgentDependency[];
}

/** Validation issue */
export interface ValidationIssue {
  readonly type: 'UNREGISTERED_CAPABILITY' | 'MISSING_CAPABILITY';
  readonly agentId: UUID;
  readonly stepId?: UUID;
  readonly capability: string;
  readonly severity: 'ERROR' | 'WARNING';
}

/** Capability validation result */
export interface CapabilityValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Expanded agents and workflows */
export interface ExpandedAgentsAndWorkflows {
  readonly id: UUID;
  readonly topologyId: UUID;
  readonly decomposedIntentId: UUID;
  readonly agentSpecifications: readonly AgentSpecification[];
  readonly workflowDefinitions: readonly WorkflowDefinition[];
  readonly interAgentDependencies: InterAgentDependencyMap;
  readonly capabilityValidation: CapabilityValidationResult;
  readonly timestamp: Timestamp;
}
