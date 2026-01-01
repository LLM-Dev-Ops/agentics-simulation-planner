/**
 * Stage 3: Organizational Topology Extraction Module
 * Extracts and models organizational structures for agent mapping.
 */

import type {
  UUID,
  DecomposedIntent,
  StructuredIntent,
  OrganizationalTopologyModel,
  HierarchyTree,
  HierarchyNode,
  TeamStructure,
  AgentArchetypeMapping,
  CommunicationGraph,
  CommunicationGraphNode,
  CommunicationGraphEdge,
  TopologyMetrics,
  TeamType,
  CommunicationProtocol,
  CommunicationDirection,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { generateDeterministicId } from '../utils/crypto.js';
import { getCurrentTimestampUTC, stableSort } from '../utils/text.js';

/** Agent archetype definitions */
interface AgentArchetype {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly communicationPatterns: readonly {
    readonly protocol: CommunicationProtocol;
    readonly direction: CommunicationDirection;
    readonly messageTypes: readonly string[];
  }[];
}

/** Predefined agent archetypes */
const AGENT_ARCHETYPES: readonly AgentArchetype[] = [
  {
    id: 'analyst',
    name: 'Data Analyst',
    capabilities: ['data_analysis', 'reporting', 'visualization'],
    communicationPatterns: [
      { protocol: 'ASYNC', direction: 'BIDIRECTIONAL', messageTypes: ['data_request', 'analysis_result'] },
    ],
  },
  {
    id: 'coordinator',
    name: 'Team Coordinator',
    capabilities: ['coordination', 'scheduling', 'resource_allocation'],
    communicationPatterns: [
      { protocol: 'SYNC', direction: 'BIDIRECTIONAL', messageTypes: ['task_assignment', 'status_update'] },
    ],
  },
  {
    id: 'executor',
    name: 'Task Executor',
    capabilities: ['task_execution', 'process_automation', 'data_processing'],
    communicationPatterns: [
      { protocol: 'ASYNC', direction: 'INBOUND', messageTypes: ['task_instruction'] },
      { protocol: 'EVENT', direction: 'OUTBOUND', messageTypes: ['completion_event'] },
    ],
  },
  {
    id: 'validator',
    name: 'Quality Validator',
    capabilities: ['validation', 'quality_assurance', 'compliance_check'],
    communicationPatterns: [
      { protocol: 'SYNC', direction: 'BIDIRECTIONAL', messageTypes: ['validation_request', 'validation_result'] },
    ],
  },
  {
    id: 'optimizer',
    name: 'Process Optimizer',
    capabilities: ['optimization', 'performance_tuning', 'bottleneck_analysis'],
    communicationPatterns: [
      { protocol: 'ASYNC', direction: 'BIDIRECTIONAL', messageTypes: ['metrics_data', 'optimization_recommendation'] },
    ],
  },
  {
    id: 'integrator',
    name: 'System Integrator',
    capabilities: ['integration', 'api_management', 'data_transformation'],
    communicationPatterns: [
      { protocol: 'STREAM', direction: 'BIDIRECTIONAL', messageTypes: ['data_stream', 'transform_result'] },
    ],
  },
];

/**
 * Role to archetype mapping rules
 */
const ROLE_TO_ARCHETYPE: Record<string, string> = {
  'analyst': 'analyst',
  'engineer': 'executor',
  'developer': 'executor',
  'manager': 'coordinator',
  'lead': 'coordinator',
  'qa': 'validator',
  'tester': 'validator',
  'architect': 'optimizer',
  'devops': 'integrator',
  'sre': 'integrator',
};

/**
 * Builds the division hierarchy tree from organizational context
 */
function buildHierarchyTree(
  intent: StructuredIntent,
  sessionId: UUID
): HierarchyTree {
  const nodes: HierarchyNode[] = [];
  const edges: { parentId: UUID; childId: UUID }[] = [];

  // Add organization root node
  const orgNodeId = generateDeterministicId(
    'org',
    sessionId,
    intent.context.organizationId
  );
  nodes.push({
    id: orgNodeId,
    name: intent.context.organizationName,
    type: 'ORGANIZATION',
    level: 0,
  });

  // Process divisions
  const divisionIds = new Map<UUID, UUID>();
  for (const division of intent.context.topology.divisions) {
    const nodeId = generateDeterministicId(
      'div',
      sessionId,
      division.id
    );
    divisionIds.set(division.id, nodeId);

    nodes.push({
      id: nodeId,
      name: division.name,
      type: 'DIVISION',
      level: division.level,
      metadata: {
        headcount: division.headcount,
        budget: division.budget,
        region: division.region,
      },
    });

    // Create edge to parent
    if (division.parentId) {
      const parentNodeId = divisionIds.get(division.parentId);
      if (parentNodeId) {
        edges.push({ parentId: parentNodeId, childId: nodeId });
      }
    } else {
      // Top-level division connects to organization
      edges.push({ parentId: orgNodeId, childId: nodeId });
    }
  }

  return { nodes, edges };
}

/**
 * Extracts team structures from organizational context
 */
function extractTeamStructures(
  intent: StructuredIntent,
  sessionId: UUID
): readonly TeamStructure[] {
  const structures: TeamStructure[] = [];

  for (const team of intent.context.topology.teams) {
    // Classify team type
    const teamType = classifyTeamType(team.name, team.capabilities);

    // Aggregate roles
    const roleMap = new Map<string, number>();
    for (const member of team.members) {
      const count = roleMap.get(member.role) ?? 0;
      roleMap.set(member.role, count + 1);
    }

    const roles = Array.from(roleMap.entries()).map(([role, count]) => ({
      role,
      count,
    }));

    structures.push({
      id: generateDeterministicId('team', sessionId, team.id),
      name: team.name,
      divisionId: team.divisionId,
      teamType,
      size: team.members.length,
      capabilities: team.capabilities,
      roles: stableSort(roles, r => r.role),
    });
  }

  return stableSort(structures, s => s.name);
}

/**
 * Classifies a team into a type
 */
function classifyTeamType(name: string, capabilities: readonly string[]): TeamType {
  const nameLower = name.toLowerCase();
  const capsLower = capabilities.map(c => c.toLowerCase());

  if (capsLower.some(c => c.includes('engineer') || c.includes('develop'))) {
    return 'ENGINEERING';
  }
  if (capsLower.some(c => c.includes('ops') || c.includes('sre'))) {
    return 'OPERATIONS';
  }
  if (nameLower.includes('sales') || capsLower.some(c => c.includes('sales'))) {
    return 'SALES';
  }
  if (nameLower.includes('marketing') || capsLower.some(c => c.includes('marketing'))) {
    return 'MARKETING';
  }
  if (nameLower.includes('support') || capsLower.some(c => c.includes('support'))) {
    return 'SUPPORT';
  }
  if (nameLower.includes('research') || capsLower.some(c => c.includes('research'))) {
    return 'RESEARCH';
  }
  if (capsLower.some(c => c.includes('cross'))) {
    return 'CROSS_FUNCTIONAL';
  }

  return 'ENGINEERING'; // Default
}

/**
 * Maps organizational roles to agent archetypes
 */
function mapToArchetypes(
  teamStructures: readonly TeamStructure[],
  sessionId: UUID
): readonly AgentArchetypeMapping[] {
  const mappings: AgentArchetypeMapping[] = [];

  for (const team of teamStructures) {
    for (const roleComp of team.roles) {
      // Find matching archetype
      const archetypeId = findArchetypeForRole(roleComp.role);
      const archetype = AGENT_ARCHETYPES.find(a => a.id === archetypeId);

      if (archetype) {
        mappings.push({
          teamId: team.id,
          role: roleComp.role,
          instanceCount: roleComp.count,
          archetypeId: archetype.id,
          archetypeName: archetype.name,
          capabilities: archetype.capabilities,
          communicationPatterns: archetype.communicationPatterns,
        });
      }
    }
  }

  return stableSort(mappings, m => [m.teamId, m.role]);
}

/**
 * Finds the appropriate archetype for a role
 */
function findArchetypeForRole(role: string): string {
  const roleLower = role.toLowerCase();

  for (const [keyword, archetypeId] of Object.entries(ROLE_TO_ARCHETYPE)) {
    if (roleLower.includes(keyword)) {
      return archetypeId;
    }
  }

  return 'executor'; // Default archetype
}

/**
 * Builds communication patterns graph
 */
function buildCommunicationGraph(
  teamStructures: readonly TeamStructure[],
  intent: StructuredIntent,
  sessionId: UUID
): CommunicationGraph {
  const nodes: CommunicationGraphNode[] = [];
  const edges: CommunicationGraphEdge[] = [];

  // Create nodes for each team
  for (const team of teamStructures) {
    nodes.push({
      id: team.id,
      type: 'TEAM',
      division: team.divisionId,
      capabilities: team.capabilities,
    });
  }

  // Create edges from explicit communication channels
  if (intent.context.communicationChannels) {
    for (const channel of intent.context.communicationChannels) {
      edges.push({
        sourceId: channel.sourceTeamId,
        targetId: channel.targetTeamId,
        metadata: {
          type: channel.type,
          frequency: channel.frequency,
          protocol: channel.protocol,
        },
      });
    }
  }

  // Infer additional communication patterns based on team relationships
  // Teams in the same division likely communicate
  const teamsByDivision = new Map<UUID, TeamStructure[]>();
  for (const team of teamStructures) {
    const existing = teamsByDivision.get(team.divisionId) ?? [];
    existing.push(team);
    teamsByDivision.set(team.divisionId, existing);
  }

  for (const [_, divisionTeams] of teamsByDivision) {
    for (let i = 0; i < divisionTeams.length; i++) {
      for (let j = i + 1; j < divisionTeams.length; j++) {
        const team1 = divisionTeams[i]!;
        const team2 = divisionTeams[j]!;

        // Check if edge already exists
        const exists = edges.some(
          e => (e.sourceId === team1.id && e.targetId === team2.id) ||
               (e.sourceId === team2.id && e.targetId === team1.id)
        );

        if (!exists) {
          edges.push({
            sourceId: team1.id,
            targetId: team2.id,
            metadata: {
              type: 'intra_division',
              frequency: 'regular',
              inferred: true,
            },
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Computes topology metrics
 */
function computeMetrics(
  hierarchy: HierarchyTree,
  teams: readonly TeamStructure[],
  mappings: readonly AgentArchetypeMapping[],
  commGraph: CommunicationGraph
): TopologyMetrics {
  // Calculate hierarchy depth
  const levelMax = hierarchy.nodes.reduce((max, n) => Math.max(max, n.level), 0);

  // Calculate communication density
  const possibleEdges = (commGraph.nodes.length * (commGraph.nodes.length - 1)) / 2;
  const density = possibleEdges > 0 ? commGraph.edges.length / possibleEdges : 0;

  return {
    totalDivisions: hierarchy.nodes.filter(n => n.type === 'DIVISION').length,
    totalTeams: teams.length,
    totalAgentMappings: mappings.reduce((sum, m) => sum + m.instanceCount, 0),
    hierarchyDepth: levelMax,
    communicationDensity: Math.round(density * 100) / 100,
  };
}

/**
 * Extracts organizational topology model
 */
export async function extractTopology(
  decomposedIntent: DecomposedIntent,
  intent: StructuredIntent,
  adapter: RuvvectorAdapter
): Promise<OrganizationalTopologyModel> {
  const startTime = getCurrentTimestampUTC();
  const sessionId = intent.sessionId;

  // Build hierarchy tree
  const divisionHierarchy = buildHierarchyTree(intent, sessionId);

  // Extract team structures
  const teamStructures = extractTeamStructures(intent, sessionId);

  // Map to agent archetypes
  const agentArchetypeMappings = mapToArchetypes(teamStructures, sessionId);

  // Build communication graph
  const communicationPatterns = buildCommunicationGraph(
    teamStructures,
    intent,
    sessionId
  );

  // Compute metrics
  const metrics = computeMetrics(
    divisionHierarchy,
    teamStructures,
    agentArchetypeMappings,
    communicationPatterns
  );

  // Generate deterministic ID
  const topologyId = generateDeterministicId(
    'topology',
    sessionId,
    decomposedIntent.id
  );

  // Create topology model
  const topologyModel: OrganizationalTopologyModel = {
    id: topologyId,
    organizationId: intent.context.organizationId,
    extractedFrom: decomposedIntent.id,
    divisionHierarchy,
    teamStructures,
    agentArchetypeMappings,
    communicationPatterns,
    metrics,
    timestamp: startTime,
  };

  // Store in ruvvector
  await adapter.store(
    `topology:${topologyId}`,
    topologyModel,
    { stage: 'TOPOLOGY_EXTRACTION', type: 'topology_model' }
  );

  // Create relation to decomposed intent
  await adapter.createRelation(
    topologyId,
    decomposedIntent.id,
    'EXTRACTED_FROM',
    { stage: 'TOPOLOGY_EXTRACTION' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'TOPOLOGY_EXTRACTION',
    operation: 'EXTRACT',
    inputId: decomposedIntent.id,
    outputId: topologyId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'SUCCESS',
    metrics: {
      divisionCount: metrics.totalDivisions,
      teamCount: metrics.totalTeams,
      agentMappingCount: metrics.totalAgentMappings,
      communicationEdgeCount: communicationPatterns.edges.length,
    },
  };
  await adapter.appendAudit(sessionId, auditEntry);

  return topologyModel;
}
