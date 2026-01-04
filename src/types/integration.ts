/**
 * Integration type definitions
 * Defines structures for integration discovery and capability matching.
 */

import type { UUID, Timestamp, MatchStatus, RepositoryStatus } from './common.js';
import type { ERPSurfaceContract, ERPSurfaceReference, ERPIntegrationRequirement, ERPDomain } from './erp-surface.js';

/** Capability definition */
export interface Capability {
  readonly id: UUID;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
}

/** API endpoint definition */
export interface Endpoint {
  readonly path: string;
  readonly method: string;
  readonly version: string;
}

/** Contract definition */
export interface Contract {
  readonly version: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly errorSchema?: Record<string, unknown>;
  readonly sla?: SLASpecification;
}

/** SLA specification */
export interface SLASpecification {
  readonly availability: number;
  readonly latencyP50Ms: number;
  readonly latencyP99Ms: number;
  readonly throughputPerSecond: number;
}

/** Capability surface of a repository */
export interface RepositoryCapabilitySurface {
  readonly repository: string;
  readonly capabilities: readonly Capability[];
  readonly version: string;
  readonly status: RepositoryStatus;
  readonly endpoints?: readonly Endpoint[];
  readonly contracts?: readonly Contract[];
}

/** Capability provider information */
export interface CapabilityProvider {
  readonly repository: string;
  readonly capability: Capability;
  readonly endpoint?: Endpoint;
  readonly contract?: Contract;
  readonly matchScore: number;
}

/** Capability match result */
export interface CapabilityMatch {
  readonly requiredCapability: string;
  readonly providers: readonly CapabilityProvider[];
  readonly selectedProvider?: CapabilityProvider;
  readonly status: MatchStatus;
}

/** Integration contract */
export interface IntegrationContract {
  readonly id: UUID;
  readonly capability: string;
  readonly provider: string;
  readonly contractVersion: string;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly errorSchema?: Record<string, unknown>;
  readonly sla?: SLASpecification;
}

/** Integration map */
export interface IntegrationMap {
  readonly id: UUID;
  readonly expandedId: UUID;
  readonly repositorySurfaces: readonly RepositoryCapabilitySurface[];
  readonly capabilityMatches: readonly CapabilityMatch[];
  readonly integrationContracts: readonly IntegrationContract[];
  readonly timestamp: Timestamp;

  /**
   * ERP surface contracts available for simulation planning.
   * These represent abstract ERP capabilities that can be referenced
   * without coupling to specific vendor implementations.
   */
  readonly erpSurfaces?: readonly ERPSurfaceContract[];

  /**
   * ERP surface references used by this integration.
   * Maps simulation requirements to abstract ERP capabilities.
   */
  readonly erpReferences?: readonly ERPSurfaceReference[];

  /**
   * ERP integration requirements discovered during planning.
   * Expresses what ERP capabilities the simulation needs.
   */
  readonly erpRequirements?: readonly ERPIntegrationRequirement[];
}

/**
 * ERP Capability Match
 * Result of matching simulation requirements to ERP surface capabilities
 */
export interface ERPCapabilityMatch {
  /** Domain being matched */
  readonly domain: ERPDomain;

  /** Required capability name */
  readonly requiredCapability: string;

  /** Available ERP surfaces that provide this capability */
  readonly availableSurfaces: readonly ERPSurfaceContract[];

  /** Selected surface (if any) */
  readonly selectedSurface?: ERPSurfaceContract;

  /** Match status */
  readonly status: MatchStatus;

  /** Match confidence score (0-100) */
  readonly confidenceScore: number;
}
