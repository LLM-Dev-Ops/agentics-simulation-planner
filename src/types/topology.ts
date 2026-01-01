/**
 * Organizational topology type definitions
 * Defines structures for modeling enterprise organizational structures.
 */

import type {
  UUID,
  Timestamp,
  TeamType,
  CommunicationProtocol,
  CommunicationDirection,
} from './common.js';

/** Node in the hierarchy tree */
export interface HierarchyNode {
  readonly id: UUID;
  readonly name: string;
  readonly type: 'DIVISION' | 'ORGANIZATION';
  readonly level: number;
  readonly metadata?: {
    readonly headcount?: number;
    readonly budget?: number;
    readonly region?: string;
  };
}

/** Hierarchy tree structure */
export interface HierarchyTree {
  readonly nodes: readonly HierarchyNode[];
  readonly edges: readonly { readonly parentId: UUID; readonly childId: UUID }[];
}

/** Role composition within a team */
export interface RoleComposition {
  readonly role: string;
  readonly count: number;
}

/** Team structure extracted from topology */
export interface TeamStructure {
  readonly id: UUID;
  readonly name: string;
  readonly divisionId: UUID;
  readonly teamType: TeamType;
  readonly size: number;
  readonly capabilities: readonly string[];
  readonly roles: readonly RoleComposition[];
}

/** Communication pattern for an agent archetype */
export interface ArchetypeCommunicationPattern {
  readonly protocol: CommunicationProtocol;
  readonly direction: CommunicationDirection;
  readonly messageTypes: readonly string[];
}

/** Agent archetype definition */
export interface AgentArchetype {
  readonly id: UUID;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly communicationPatterns: readonly ArchetypeCommunicationPattern[];
}

/** Mapping from organizational role to agent archetype */
export interface AgentArchetypeMapping {
  readonly teamId: UUID;
  readonly role: string;
  readonly instanceCount: number;
  readonly archetypeId: UUID;
  readonly archetypeName: string;
  readonly capabilities: readonly string[];
  readonly communicationPatterns: readonly ArchetypeCommunicationPattern[];
}

/** Communication graph node */
export interface CommunicationGraphNode {
  readonly id: UUID;
  readonly type: 'TEAM';
  readonly division: UUID;
  readonly capabilities: readonly string[];
}

/** Communication graph edge */
export interface CommunicationGraphEdge {
  readonly sourceId: UUID;
  readonly targetId: UUID;
  readonly metadata: {
    readonly type: string;
    readonly frequency: string;
    readonly protocol?: string;
    readonly inferred?: boolean;
  };
}

/** Communication patterns graph */
export interface CommunicationGraph {
  readonly nodes: readonly CommunicationGraphNode[];
  readonly edges: readonly CommunicationGraphEdge[];
}

/** Topology metrics for validation */
export interface TopologyMetrics {
  readonly totalDivisions: number;
  readonly totalTeams: number;
  readonly totalAgentMappings: number;
  readonly hierarchyDepth: number;
  readonly communicationDensity: number;
}

/** Complete organizational topology model */
export interface OrganizationalTopologyModel {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly extractedFrom: UUID;
  readonly divisionHierarchy: HierarchyTree;
  readonly teamStructures: readonly TeamStructure[];
  readonly agentArchetypeMappings: readonly AgentArchetypeMapping[];
  readonly communicationPatterns: CommunicationGraph;
  readonly metrics: TopologyMetrics;
  readonly timestamp: Timestamp;
}
