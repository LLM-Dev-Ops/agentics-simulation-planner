/**
 * Intent-related type definitions
 * Defines structures for natural language processing and intent extraction.
 */

import type {
  UUID,
  Timestamp,
  SHA256Hash,
  TokenType,
  EntityType,
  ConstraintType,
  ActionComplexity,
  Priority,
} from './common.js';

/** Token extracted from natural language input */
export interface Token {
  readonly type: TokenType;
  readonly subtype?: string;
  readonly value?: string;
  readonly position: number;
}

/** Temporal constraint extracted from input */
export interface TemporalConstraint {
  readonly expression: string;
  readonly normalized: string;
  readonly scopeStart: number;
  readonly scopeEnd: number;
}

/** Quantitative requirement extracted from input */
export interface QuantitativeRequirement {
  readonly value: number;
  readonly unit: string;
  readonly target: string;
}

/** Reference to an organizational entity */
export interface OrganizationalReference {
  readonly name: string;
  readonly type: EntityType;
  readonly context: string;
}

/** Constraint on an objective */
export interface ObjectiveConstraint {
  readonly type: ConstraintType;
  readonly specification: string;
  readonly priority: Priority;
  readonly targetEntity?: string;
}

/** Parsed objective from natural language */
export interface ParsedObjective {
  readonly action: string;
  readonly targets: readonly string[];
  readonly modifiers: readonly string[];
  readonly constraints: readonly ObjectiveConstraint[];
  readonly position: number;
}

/** Components extracted from intent */
export interface IntentComponents {
  readonly objectives: readonly ParsedObjective[];
  readonly organizationalReferences: readonly OrganizationalReference[];
  readonly temporalConstraints: readonly TemporalConstraint[];
  readonly quantitativeRequirements: readonly QuantitativeRequirement[];
}

/** Structured representation of parsed intent */
export interface StructuredIntent {
  readonly id: UUID;
  readonly rawInput: string;
  readonly normalizedInput: string;
  readonly tokens: readonly Token[];
  readonly components: IntentComponents;
  readonly context: OrganizationalContext;
  readonly sessionId: UUID;
  readonly timestamp: Timestamp;
  readonly inputHash: SHA256Hash;
}

/** Atomic objective after decomposition */
export interface AtomicObjective {
  readonly id: UUID;
  readonly action: string;
  readonly targets: readonly string[];
  readonly constraints: readonly ObjectiveConstraint[];
  readonly parent: ParsedObjective;
  readonly phase?: number;
  readonly isLeaf: boolean;
  readonly complexity: ActionComplexity;
}

/** Implicit requirement discovered during decomposition */
export interface ImplicitRequirement {
  readonly type: 'RESOURCE_PREREQUISITE' | 'CAPABILITY_PREREQUISITE' | 'AUTHORIZATION_PREREQUISITE';
  readonly resource?: string;
  readonly capability?: string;
  readonly authorization?: AuthorizationRequirement;
  readonly requiredBy: UUID;
  readonly reason: string;
}

/** Authorization requirement */
export interface AuthorizationRequirement {
  readonly level: string;
  readonly scope: string;
}

/** Serialized dependency graph */
export interface DependencyGraphData {
  readonly nodes: readonly { readonly id: UUID; readonly data: AtomicObjective }[];
  readonly edges: readonly { readonly from: UUID; readonly to: UUID; readonly weight: number }[];
}

/** Result of intent decomposition */
export interface DecomposedIntent {
  readonly id: UUID;
  readonly sourceIntentId: UUID;
  readonly atomicObjectives: readonly AtomicObjective[];
  readonly dependencyGraph: DependencyGraphData;
  readonly executionOrder: readonly UUID[];
  readonly implicitRequirements: readonly ImplicitRequirement[];
  readonly decompositionHash: SHA256Hash;
  readonly timestamp: Timestamp;
}

/** Division in organizational hierarchy */
export interface Division {
  readonly id: UUID;
  readonly name: string;
  readonly level: number;
  readonly parentId?: UUID;
  readonly headcount?: number;
  readonly budget?: number;
  readonly region?: string;
}

/** Team member */
export interface TeamMember {
  readonly id: UUID;
  readonly name: string;
  readonly role: string;
}

/** Team in organization */
export interface Team {
  readonly id: UUID;
  readonly name: string;
  readonly divisionId: UUID;
  readonly members: readonly TeamMember[];
  readonly capabilities: readonly string[];
}

/** Communication channel between teams */
export interface CommunicationChannel {
  readonly sourceTeamId: UUID;
  readonly targetTeamId: UUID;
  readonly type: string;
  readonly frequency: string;
  readonly protocol: string;
}

/** Organizational topology */
export interface OrganizationalTopology {
  readonly divisions: readonly Division[];
  readonly teams: readonly Team[];
}

/** Constraint set */
export interface ConstraintSet {
  readonly constraints: readonly ObjectiveConstraint[];
}

/** Organizational context provided as input */
export interface OrganizationalContext {
  readonly organizationId: UUID;
  readonly organizationName: string;
  readonly topology: OrganizationalTopology;
  readonly constraints: ConstraintSet;
  readonly communicationChannels?: readonly CommunicationChannel[];
}
