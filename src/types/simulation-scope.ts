/**
 * Simulation Scope Type Definitions
 *
 * Defines the scope and boundaries for simulations targeting the
 * agentics-simulation-runner. These types establish what domains,
 * capabilities, time horizons, and data volumes are in scope for
 * a given simulation plan.
 *
 * IMPORTANT: This module is ONLY for defining scope boundaries.
 * It does NOT include execution logic, runtime behavior, or
 * simulation orchestration.
 */

import type { Timestamp, SHA256Hash } from './common.js';
import type { ERPDomain, ERPCapabilityType } from './erp-surface.js';

/**
 * Time granularity for simulation time horizon.
 * Determines the resolution at which time-based events and
 * measurements are tracked within the simulation.
 */
export type TimeGranularity = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

/**
 * Scope type indicating the extent of simulation coverage.
 *
 * - FULL: Complete simulation of all specified domains and capabilities
 * - PARTIAL: Subset of domains/capabilities for focused analysis
 * - INCREMENTAL: Delta simulation building on previous scope
 */
export type ScopeType = 'FULL' | 'PARTIAL' | 'INCREMENTAL';

/**
 * Estimated complexity level for simulation scope.
 * Used to inform resource allocation and execution planning.
 */
export type ScopeComplexity = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

/**
 * Time horizon definition for a simulation scope.
 * Establishes the temporal boundaries within which the
 * simulation operates.
 */
export interface SimulationTimeHorizon {
  /**
   * Start timestamp for the simulation period (ISO 8601).
   * All simulated events and data must fall on or after this time.
   */
  readonly start: Timestamp;

  /**
   * End timestamp for the simulation period (ISO 8601).
   * All simulated events and data must fall on or before this time.
   */
  readonly end: Timestamp;

  /**
   * Time granularity for the simulation.
   * Determines the resolution of time-based measurements and events.
   */
  readonly granularity: TimeGranularity;
}

/**
 * Data volume bounds for a simulation scope.
 * Establishes the expected record counts for simulation sizing
 * and resource planning.
 */
export interface DataVolumeBounds {
  /**
   * Minimum number of records expected in the simulation.
   * Must be a non-negative integer.
   */
  readonly minRecords: number;

  /**
   * Maximum number of records expected in the simulation.
   * Must be greater than or equal to minRecords.
   */
  readonly maxRecords: number;
}

/**
 * SimulationScope
 *
 * Defines the scope and boundaries of a simulation targeting
 * the agentics-simulation-runner. This interface establishes:
 * - Target engine and version compatibility
 * - Scope type (full, partial, incremental)
 * - Included ERP domains
 * - Excluded capabilities
 * - Time horizon for simulation
 * - Data volume expectations
 *
 * @example
 * ```typescript
 * const scope: SimulationScope = {
 *   targetEngine: 'agentics-simulation-runner',
 *   engineVersion: '>=1.0.0 <2.0.0',
 *   scopeType: 'PARTIAL',
 *   includedDomains: ['FINANCE', 'SUPPLY_CHAIN'],
 *   excludedCapabilities: ['tax_management'],
 *   timeHorizon: {
 *     start: '2024-01-01T00:00:00Z',
 *     end: '2024-12-31T23:59:59Z',
 *     granularity: 'DAY'
 *   },
 *   dataVolumeBounds: {
 *     minRecords: 10000,
 *     maxRecords: 1000000
 *   }
 * };
 * ```
 */
export interface SimulationScope {
  /**
   * Target simulation engine identifier.
   * Must be the literal string 'agentics-simulation-runner'.
   */
  readonly targetEngine: 'agentics-simulation-runner';

  /**
   * Semantic version constraint for engine compatibility.
   * Follows npm semver syntax (e.g., '>=1.0.0', '^2.0.0', '1.x').
   */
  readonly engineVersion: string;

  /**
   * Type of simulation scope.
   * - FULL: Complete coverage of all specified domains
   * - PARTIAL: Focused subset for targeted analysis
   * - INCREMENTAL: Delta simulation extending previous scope
   */
  readonly scopeType: ScopeType;

  /**
   * ERP domains included in this simulation scope.
   * Only capabilities from these domains will be simulated.
   */
  readonly includedDomains: readonly ERPDomain[];

  /**
   * Capabilities explicitly excluded from the simulation.
   * These capabilities will not be simulated even if their
   * parent domain is included.
   */
  readonly excludedCapabilities: readonly ERPCapabilityType[];

  /**
   * Time horizon defining the temporal boundaries of the simulation.
   * All simulated events must fall within this period.
   */
  readonly timeHorizon: SimulationTimeHorizon;

  /**
   * Expected data volume bounds for simulation sizing.
   * Used for resource planning and capacity estimation.
   */
  readonly dataVolumeBounds: DataVolumeBounds;
}

/**
 * SimulationScopeValidation
 *
 * Represents the validation result for a SimulationScope.
 * Provides deterministic verification of scope correctness
 * including a content-addressable hash for caching and
 * deduplication.
 *
 * @example
 * ```typescript
 * const validation: SimulationScopeValidation = {
 *   valid: true,
 *   scopeHash: 'a1b2c3d4e5f6...',
 *   estimatedComplexity: 'MEDIUM',
 *   warnings: [
 *     'Time horizon spans multiple fiscal years',
 *     'Data volume bounds have wide range'
 *   ]
 * };
 * ```
 */
export interface SimulationScopeValidation {
  /**
   * Whether the scope passed all validation checks.
   * A scope is valid if all structural and semantic
   * constraints are satisfied.
   */
  readonly valid: boolean;

  /**
   * SHA-256 hash of the canonical scope representation.
   * Used for content-addressable caching and deduplication
   * of equivalent scopes.
   */
  readonly scopeHash: SHA256Hash;

  /**
   * Estimated complexity of simulating this scope.
   * Based on domain count, capability exclusions,
   * time horizon span, and data volume bounds.
   */
  readonly estimatedComplexity: ScopeComplexity;

  /**
   * Non-fatal warnings about the scope definition.
   * These do not prevent validation but indicate
   * potential issues or optimization opportunities.
   */
  readonly warnings: readonly string[];
}
