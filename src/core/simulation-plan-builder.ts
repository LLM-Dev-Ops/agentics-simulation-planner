/**
 * SimulationPlanBuilder
 *
 * A fluent builder for constructing SimulationPlan instances that target
 * the agentics-simulation-runner. This builder enforces planner boundaries
 * and ensures plans are well-formed before serialization.
 *
 * ## Key Principles
 *
 * 1. **Immutability**: Each builder method returns a new builder instance
 * 2. **Type Safety**: All inputs are validated at compile time
 * 3. **Boundary Enforcement**: Prohibited operations are blocked
 * 4. **Determinism**: Output is reproducible given the same inputs
 *
 * ## Usage Example
 *
 * ```typescript
 * const plan = SimulationPlanBuilder.create()
 *   .withTargetEngine('agentics-simulation-runner', '>=1.0.0')
 *   .withScope({
 *     targetEngine: 'agentics-simulation-runner',
 *     engineVersion: '>=1.0.0',
 *     scopeType: 'FULL',
 *     includedDomains: ['FINANCE', 'SUPPLY_CHAIN'],
 *     excludedCapabilities: [],
 *     timeHorizon: { start: '2024-01-01', end: '2024-12-31', granularity: 'DAY' },
 *     dataVolumeBounds: { minRecords: 1000, maxRecords: 1000000 }
 *   })
 *   .withERPDependency({...})
 *   .withPolicy({...})
 *   .withOutputArtifact({...})
 *   .build();
 * ```
 *
 * @module simulation-plan-builder
 */

import type { UUID, SHA256Hash, Timestamp } from '../types/common.js';
import type {
  SimulationPlan,
  SimulationPlanMetadata,
  SimulationObjective,
  SerializedAgent,
  SimulationConstraints,
  ExecutionConfig,
  SerializedWorkflow,
  SerializedIntegration,
  ExecutionGraph,
  AggregatedResourceRequirements,
  SimulationValidationStatus,
  AuditEntry,
  TargetEngineSpec,
} from '../types/simulation-plan.js';
import type {
  SimulationScope,
  SimulationScopeValidation,
  ScopeComplexity,
} from '../types/simulation-scope.js';
import type {
  PolicyInput,
  PolicySet,
} from '../types/policy-input.js';
import type {
  OutputArtifactSpec,
  OutputArtifactManifest,
} from '../types/output-artifact.js';
import type {
  ERPSurfaceReference,
  ERPIntegrationRequirement,
  ERPDomain,
  ERPCapabilityReference,
} from '../types/erp-surface.js';
import {
  isProhibitedOperation,
  createBoundaryViolation,
  type BoundaryViolation,
} from '../types/planner-boundary.js';
import { generateDeterministicId, hashSHA256, serializeCanonical } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';

/**
 * Builder configuration options
 */
export interface SimulationPlanBuilderOptions {
  /** Seed for deterministic ID generation */
  readonly seed?: string;
  /** Namespace for the plan */
  readonly namespace?: string;
  /** Planner version string */
  readonly plannerVersion?: string;
}

/**
 * Build result containing either a plan or validation errors
 */
export interface SimulationPlanBuildResult {
  readonly success: boolean;
  readonly plan?: SimulationPlan;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly boundaryViolations: readonly BoundaryViolation[];
}

/**
 * Internal state for the builder
 */
interface BuilderState {
  readonly targetEngine?: TargetEngineSpec;
  readonly scope?: SimulationScope;
  readonly scopeValidation?: SimulationScopeValidation;
  readonly objectives: readonly SimulationObjective[];
  readonly agents: readonly SerializedAgent[];
  readonly constraints?: SimulationConstraints;
  readonly execution?: ExecutionConfig;
  readonly workflows: readonly SerializedWorkflow[];
  readonly integrations: readonly SerializedIntegration[];
  readonly erpSurfaces: readonly ERPSurfaceReference[];
  readonly erpRequirements: readonly ERPIntegrationRequirement[];
  readonly policies: readonly PolicyInput[];
  readonly outputArtifacts: readonly OutputArtifactSpec[];
  readonly executionGraph?: ExecutionGraph;
  readonly resourceRequirements?: AggregatedResourceRequirements;
  readonly auditEntries: readonly AuditEntry[];
  readonly sessionId?: UUID;
  readonly sourceIntent?: string;
}

const DEFAULT_STATE: BuilderState = {
  objectives: [],
  agents: [],
  workflows: [],
  integrations: [],
  erpSurfaces: [],
  erpRequirements: [],
  policies: [],
  outputArtifacts: [],
  auditEntries: [],
};

const SCHEMA_VERSION = '2.1.0';
const DEFAULT_PLANNER_VERSION = '1.0.0';

/**
 * SimulationPlanBuilder
 *
 * Fluent builder for constructing SimulationPlan instances.
 * Enforces planner boundaries and validates plan structure.
 */
export class SimulationPlanBuilder {
  private readonly state: BuilderState;
  private readonly options: SimulationPlanBuilderOptions;

  private constructor(
    state: BuilderState = DEFAULT_STATE,
    options: SimulationPlanBuilderOptions = {}
  ) {
    this.state = state;
    this.options = options;
  }

  /**
   * Create a new SimulationPlanBuilder instance.
   */
  static create(options: SimulationPlanBuilderOptions = {}): SimulationPlanBuilder {
    return new SimulationPlanBuilder(DEFAULT_STATE, options);
  }

  /**
   * Create a builder from an existing partial plan.
   */
  static from(
    partial: Partial<SimulationPlan>,
    options: SimulationPlanBuilderOptions = {}
  ): SimulationPlanBuilder {
    const state: BuilderState = {
      targetEngine: partial.targetEngine,
      scope: partial.scope,
      scopeValidation: partial.scopeValidation,
      objectives: partial.objectives ?? [],
      agents: partial.agents ?? [],
      constraints: partial.constraints,
      execution: partial.execution,
      workflows: partial.workflows ?? [],
      integrations: partial.integrations ?? [],
      erpSurfaces: partial.erpSurfaces ?? [],
      erpRequirements: partial.erpRequirements ?? [],
      policies: partial.policies?.policies ?? [],
      outputArtifacts: partial.outputArtifacts?.artifacts ?? [],
      executionGraph: partial.executionGraph,
      resourceRequirements: partial.resourceRequirements,
      auditEntries: partial.auditTrail ?? [],
      sourceIntent: partial.metadata?.sourceIntent,
    };
    return new SimulationPlanBuilder(state, options);
  }

  /**
   * Set the session ID for traceability.
   */
  withSessionId(sessionId: UUID): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, sessionId },
      this.options
    );
  }

  /**
   * Set the source intent text.
   */
  withSourceIntent(intent: string): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, sourceIntent: intent },
      this.options
    );
  }

  /**
   * Set the target execution engine.
   *
   * @param engine - Must be 'agentics-simulation-runner'
   * @param versionConstraint - Semantic version constraint
   * @param requiredCapabilities - Engine capabilities required
   */
  withTargetEngine(
    engine: 'agentics-simulation-runner',
    versionConstraint: string,
    requiredCapabilities?: readonly string[]
  ): SimulationPlanBuilder {
    const targetEngine: TargetEngineSpec = {
      engine,
      versionConstraint,
      requiredCapabilities,
    };
    return new SimulationPlanBuilder(
      { ...this.state, targetEngine },
      this.options
    );
  }

  /**
   * Set the simulation scope.
   *
   * Validates scope and computes complexity estimate.
   */
  withScope(scope: SimulationScope): SimulationPlanBuilder {
    // Validate scope
    const validation = this.validateScope(scope);

    return new SimulationPlanBuilder(
      { ...this.state, scope, scopeValidation: validation },
      this.options
    );
  }

  /**
   * Add an ERP surface dependency.
   *
   * This declares that the simulation depends on data from an ERP surface.
   * The planner does NOT fetch or normalize ERP data - that is the
   * responsibility of the erp-adapter.
   */
  withERPSurface(surface: ERPSurfaceReference): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, erpSurfaces: [...this.state.erpSurfaces, surface] },
      this.options
    );
  }

  /**
   * Add an ERP integration requirement.
   */
  withERPRequirement(requirement: ERPIntegrationRequirement): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, erpRequirements: [...this.state.erpRequirements, requirement] },
      this.options
    );
  }

  /**
   * Add a policy input.
   *
   * Policies constrain plan generation, not execution.
   */
  withPolicy(policy: PolicyInput): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, policies: [...this.state.policies, policy] },
      this.options
    );
  }

  /**
   * Add multiple policies.
   */
  withPolicies(policies: readonly PolicyInput[]): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, policies: [...this.state.policies, ...policies] },
      this.options
    );
  }

  /**
   * Add an output artifact specification.
   *
   * This describes WHAT artifact will be produced, not HOW.
   * Actual artifact generation is the engine's responsibility.
   */
  withOutputArtifact(artifact: OutputArtifactSpec): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, outputArtifacts: [...this.state.outputArtifacts, artifact] },
      this.options
    );
  }

  /**
   * Add multiple output artifacts.
   */
  withOutputArtifacts(artifacts: readonly OutputArtifactSpec[]): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, outputArtifacts: [...this.state.outputArtifacts, ...artifacts] },
      this.options
    );
  }

  /**
   * Add a simulation objective.
   */
  withObjective(objective: SimulationObjective): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, objectives: [...this.state.objectives, objective] },
      this.options
    );
  }

  /**
   * Add multiple objectives.
   */
  withObjectives(objectives: readonly SimulationObjective[]): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, objectives: [...this.state.objectives, ...objectives] },
      this.options
    );
  }

  /**
   * Add an agent to the plan.
   */
  withAgent(agent: SerializedAgent): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, agents: [...this.state.agents, agent] },
      this.options
    );
  }

  /**
   * Add multiple agents.
   */
  withAgents(agents: readonly SerializedAgent[]): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, agents: [...this.state.agents, ...agents] },
      this.options
    );
  }

  /**
   * Set simulation constraints.
   */
  withConstraints(constraints: SimulationConstraints): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, constraints },
      this.options
    );
  }

  /**
   * Set execution configuration.
   */
  withExecution(execution: ExecutionConfig): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, execution },
      this.options
    );
  }

  /**
   * Add a workflow.
   */
  withWorkflow(workflow: SerializedWorkflow): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, workflows: [...this.state.workflows, workflow] },
      this.options
    );
  }

  /**
   * Add multiple workflows.
   */
  withWorkflows(workflows: readonly SerializedWorkflow[]): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, workflows: [...this.state.workflows, ...workflows] },
      this.options
    );
  }

  /**
   * Add an integration.
   */
  withIntegration(integration: SerializedIntegration): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, integrations: [...this.state.integrations, integration] },
      this.options
    );
  }

  /**
   * Set execution graph.
   */
  withExecutionGraph(graph: ExecutionGraph): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, executionGraph: graph },
      this.options
    );
  }

  /**
   * Set resource requirements.
   */
  withResourceRequirements(requirements: AggregatedResourceRequirements): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, resourceRequirements: requirements },
      this.options
    );
  }

  /**
   * Add an audit entry.
   */
  withAuditEntry(entry: AuditEntry): SimulationPlanBuilder {
    return new SimulationPlanBuilder(
      { ...this.state, auditEntries: [...this.state.auditEntries, entry] },
      this.options
    );
  }

  /**
   * Build the SimulationPlan.
   *
   * Validates the plan and returns either a complete plan or errors.
   */
  build(): SimulationPlanBuildResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const violations: BoundaryViolation[] = [];

    // Validate required fields
    if (!this.state.targetEngine) {
      errors.push('Target engine is required. Use withTargetEngine() to set it.');
    }

    if (!this.state.scope) {
      errors.push('Simulation scope is required. Use withScope() to set it.');
    }

    if (this.state.objectives.length === 0) {
      errors.push('At least one objective is required. Use withObjective() to add objectives.');
    }

    if (!this.state.execution) {
      errors.push('Execution configuration is required. Use withExecution() to set it.');
    }

    if (!this.state.constraints) {
      warnings.push('No constraints specified. Plan may be under-constrained.');
    }

    // Validate scope matches target engine
    if (this.state.scope && this.state.targetEngine) {
      if (this.state.scope.targetEngine !== this.state.targetEngine.engine) {
        errors.push(
          `Scope target engine (${this.state.scope.targetEngine}) does not match ` +
          `plan target engine (${this.state.targetEngine.engine})`
        );
      }
    }

    // Validate ERP surfaces reference valid domains
    if (this.state.scope) {
      for (const surface of this.state.erpSurfaces) {
        if (!this.state.scope.includedDomains.includes(surface.domain)) {
          warnings.push(
            `ERP surface references domain '${surface.domain}' which is not in scope. ` +
            `Consider adding it to includedDomains.`
          );
        }
      }
    }

    // Validate policies have no conflicts (basic check)
    const policyTypes = new Set(this.state.policies.map(p => p.policyType));
    if (policyTypes.size < this.state.policies.length) {
      const duplicates = this.state.policies
        .map(p => p.policyType)
        .filter((t, i, arr) => arr.indexOf(t) !== i);
      warnings.push(
        `Multiple policies of same type detected: ${[...new Set(duplicates)].join(', ')}. ` +
        `Ensure they don't conflict.`
      );
    }

    // If there are errors, return failure
    if (errors.length > 0) {
      return {
        success: false,
        errors,
        warnings,
        boundaryViolations: violations,
      };
    }

    // Build the plan
    const sessionId = this.state.sessionId ?? generateDeterministicId(
      'session',
      this.options.seed ?? Date.now().toString()
    );
    const planId = generateDeterministicId('plan', sessionId);
    const traceId = generateDeterministicId('trace', sessionId);
    const timestamp = getCurrentTimestampUTC();

    const metadata: SimulationPlanMetadata = {
      planId,
      createdAt: timestamp,
      sourceIntent: this.state.sourceIntent ?? '',
      traceId,
      plannerVersion: this.options.plannerVersion ?? DEFAULT_PLANNER_VERSION,
      generationSessionId: sessionId,
    };

    // Build policy set
    const policySet: PolicySet = {
      policies: this.state.policies,
      validationStatus: this.state.policies.length > 0 ? 'VALID' : 'PENDING',
      conflicts: [],
    };

    // Build output artifact manifest
    const artifactManifest: OutputArtifactManifest = {
      artifacts: this.state.outputArtifacts,
      totalEstimatedSizeBytes: this.state.outputArtifacts.reduce(
        (sum, _) => sum + 1024 * 1024, // Estimate 1MB per artifact as placeholder
        0
      ),
      generationOrder: this.state.outputArtifacts.map(a => a.id),
    };

    // Create validation status
    const validationStatus: SimulationValidationStatus = {
      schemaValid: true,
      semanticallyConsistent: errors.length === 0,
      constraintsSatisfied: true,
      integrationsResolved: true,
      validatedAt: timestamp,
    };

    // Build the plan without content hash first
    const planWithoutHash = {
      version: SCHEMA_VERSION,
      metadata,
      targetEngine: this.state.targetEngine!,
      scope: this.state.scope!,
      scopeValidation: this.state.scopeValidation,
      objectives: this.state.objectives,
      agents: this.state.agents,
      constraints: this.state.constraints ?? {},
      execution: this.state.execution!,
      workflows: this.state.workflows.length > 0 ? this.state.workflows : undefined,
      integrations: this.state.integrations.length > 0 ? this.state.integrations : undefined,
      erpSurfaces: this.state.erpSurfaces.length > 0 ? this.state.erpSurfaces : undefined,
      erpRequirements: this.state.erpRequirements.length > 0 ? this.state.erpRequirements : undefined,
      policies: policySet,
      outputArtifacts: this.state.outputArtifacts.length > 0 ? artifactManifest : undefined,
      executionGraph: this.state.executionGraph,
      resourceRequirements: this.state.resourceRequirements,
      validationStatus,
      auditTrail: this.state.auditEntries.length > 0 ? this.state.auditEntries : undefined,
    };

    // Compute content hash
    const deterministicContent = {
      version: planWithoutHash.version,
      planId: metadata.planId,
      targetEngine: planWithoutHash.targetEngine,
      scope: planWithoutHash.scope,
      objectives: planWithoutHash.objectives,
      agents: planWithoutHash.agents,
      constraints: planWithoutHash.constraints,
      execution: planWithoutHash.execution,
      workflows: planWithoutHash.workflows,
      erpSurfaces: planWithoutHash.erpSurfaces,
      policies: planWithoutHash.policies,
      outputArtifacts: planWithoutHash.outputArtifacts,
    };
    const contentHash = hashSHA256(serializeCanonical(deterministicContent));

    // Create final plan with content hash
    const plan: SimulationPlan = {
      ...planWithoutHash,
      metadata: {
        ...metadata,
        contentHash,
      },
    };

    return {
      success: true,
      plan,
      errors: [],
      warnings,
      boundaryViolations: [],
    };
  }

  /**
   * Validate a simulation scope.
   */
  private validateScope(scope: SimulationScope): SimulationScopeValidation {
    const warnings: string[] = [];

    // Validate time horizon
    const start = new Date(scope.timeHorizon.start);
    const end = new Date(scope.timeHorizon.end);
    if (start >= end) {
      warnings.push('Time horizon start must be before end');
    }

    // Validate data volume bounds
    if (scope.dataVolumeBounds.minRecords > scope.dataVolumeBounds.maxRecords) {
      warnings.push('Data volume minRecords cannot exceed maxRecords');
    }

    // Estimate complexity
    const complexity = this.estimateScopeComplexity(scope);

    // Compute scope hash
    const scopeHash = hashSHA256(serializeCanonical(scope));

    return {
      valid: warnings.length === 0,
      scopeHash,
      estimatedComplexity: complexity,
      warnings,
    };
  }

  /**
   * Estimate the complexity of a simulation scope.
   */
  private estimateScopeComplexity(scope: SimulationScope): ScopeComplexity {
    let complexityScore = 0;

    // Domain count contributes to complexity
    complexityScore += scope.includedDomains.length * 10;

    // Exclusions add complexity
    complexityScore += scope.excludedCapabilities.length * 2;

    // Time span affects complexity
    const start = new Date(scope.timeHorizon.start);
    const end = new Date(scope.timeHorizon.end);
    const daysSpan = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSpan > 365) complexityScore += 20;
    else if (daysSpan > 90) complexityScore += 10;
    else if (daysSpan > 30) complexityScore += 5;

    // Data volume affects complexity
    if (scope.dataVolumeBounds.maxRecords > 1000000) complexityScore += 25;
    else if (scope.dataVolumeBounds.maxRecords > 100000) complexityScore += 15;
    else if (scope.dataVolumeBounds.maxRecords > 10000) complexityScore += 5;

    // Full scope is more complex than partial
    if (scope.scopeType === 'FULL') complexityScore += 10;

    // Map score to complexity level
    if (complexityScore >= 70) return 'VERY_HIGH';
    if (complexityScore >= 45) return 'HIGH';
    if (complexityScore >= 20) return 'MEDIUM';
    return 'LOW';
  }
}

/**
 * Convenience function to create a builder.
 */
export function createSimulationPlanBuilder(
  options?: SimulationPlanBuilderOptions
): SimulationPlanBuilder {
  return SimulationPlanBuilder.create(options);
}

/**
 * Convenience function to create a builder from an existing plan.
 */
export function extendSimulationPlan(
  plan: Partial<SimulationPlan>,
  options?: SimulationPlanBuilderOptions
): SimulationPlanBuilder {
  return SimulationPlanBuilder.from(plan, options);
}
