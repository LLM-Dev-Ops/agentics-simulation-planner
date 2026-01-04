/**
 * ERP Surface Type Definitions
 *
 * Provides abstract ERP capability contracts for simulation planning.
 * These types allow simulation intents to reference ERP-related capabilities
 * (Finance, HR, Operations, Supply Chain) without coupling to any specific
 * vendor or implementation.
 *
 * IMPORTANT: This is a synthetic simulation surface for deterministic planning
 * and auditability. It does NOT include adapters, SDKs, API calls, or runtime
 * execution logic.
 */

import type { UUID, RepositoryStatus, Priority } from './common.js';

/**
 * ERP Domain Categories
 * High-level functional domains within enterprise resource planning
 */
export type ERPDomain =
  | 'FINANCE'
  | 'HUMAN_RESOURCES'
  | 'OPERATIONS'
  | 'SUPPLY_CHAIN'
  | 'CUSTOMER_RELATIONSHIP'
  | 'PROJECT_MANAGEMENT'
  | 'ASSET_MANAGEMENT'
  | 'PROCUREMENT';

/**
 * ERP Capability Categories by Domain
 * Standardized capability names for simulation planning
 */
export type ERPFinanceCapability =
  | 'general_ledger'
  | 'accounts_payable'
  | 'accounts_receivable'
  | 'budgeting'
  | 'financial_reporting'
  | 'tax_management'
  | 'treasury_management'
  | 'expense_management'
  | 'revenue_recognition'
  | 'cost_accounting';

export type ERPHumanResourcesCapability =
  | 'employee_management'
  | 'payroll_processing'
  | 'benefits_administration'
  | 'recruitment'
  | 'performance_management'
  | 'learning_management'
  | 'time_attendance'
  | 'workforce_planning'
  | 'compensation_management'
  | 'succession_planning';

export type ERPOperationsCapability =
  | 'production_planning'
  | 'quality_management'
  | 'maintenance_management'
  | 'shop_floor_control'
  | 'capacity_planning'
  | 'work_order_management'
  | 'bill_of_materials'
  | 'resource_scheduling'
  | 'process_automation'
  | 'operational_analytics';

export type ERPSupplyChainCapability =
  | 'inventory_management'
  | 'warehouse_management'
  | 'demand_forecasting'
  | 'order_management'
  | 'logistics_management'
  | 'supplier_management'
  | 'purchase_order_management'
  | 'shipment_tracking'
  | 'returns_management'
  | 'supply_chain_analytics';

export type ERPCustomerCapability =
  | 'customer_data_management'
  | 'sales_management'
  | 'service_management'
  | 'contract_management'
  | 'customer_analytics'
  | 'campaign_management'
  | 'lead_management'
  | 'quote_management'
  | 'customer_portal'
  | 'case_management';

export type ERPProjectCapability =
  | 'project_planning'
  | 'resource_allocation'
  | 'project_budgeting'
  | 'milestone_tracking'
  | 'project_reporting'
  | 'time_tracking'
  | 'project_billing'
  | 'risk_management'
  | 'collaboration'
  | 'portfolio_management';

/**
 * Union of all ERP capability types
 */
export type ERPCapabilityType =
  | ERPFinanceCapability
  | ERPHumanResourcesCapability
  | ERPOperationsCapability
  | ERPSupplyChainCapability
  | ERPCustomerCapability
  | ERPProjectCapability;

/**
 * ERP Event Categories
 * Standard event types that can be simulated from ERP systems
 */
export type ERPEventCategory =
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_COMPLETED'
  | 'TRANSACTION_CANCELLED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED'
  | 'THRESHOLD_EXCEEDED'
  | 'STATUS_CHANGED'
  | 'RECORD_CREATED'
  | 'RECORD_UPDATED'
  | 'RECORD_DELETED'
  | 'BATCH_COMPLETED'
  | 'SCHEDULE_TRIGGERED'
  | 'EXCEPTION_RAISED';

/**
 * ERP Capability Definition
 * Abstract representation of an ERP capability for simulation planning
 */
export interface ERPCapability {
  /** Unique identifier for this capability definition */
  readonly id: UUID;

  /** Human-readable capability name */
  readonly name: ERPCapabilityType;

  /** Domain this capability belongs to */
  readonly domain: ERPDomain;

  /** Version of the capability contract (semantic versioning) */
  readonly version: string;

  /** Optional description of the capability */
  readonly description?: string;

  /** Events this capability can emit */
  readonly emittedEvents?: readonly ERPEventType[];

  /** Events this capability can consume */
  readonly consumedEvents?: readonly ERPEventType[];

  /** Related capabilities that may be required */
  readonly relatedCapabilities?: readonly ERPCapabilityType[];
}

/**
 * ERP Event Type Definition
 * Abstract representation of an event from ERP systems
 */
export interface ERPEventType {
  /** Event category */
  readonly category: ERPEventCategory;

  /** Domain-specific event name */
  readonly name: string;

  /** Payload schema (abstract, no concrete implementation) */
  readonly payloadSchema?: ERPEventPayloadSchema;

  /** Priority of handling this event */
  readonly priority?: Priority;
}

/**
 * ERP Event Payload Schema
 * Abstract schema definition for event payloads
 */
export interface ERPEventPayloadSchema {
  /** Schema type (e.g., 'object', 'array') */
  readonly type: string;

  /** Required field names */
  readonly required?: readonly string[];

  /** Field definitions (abstract, not concrete types) */
  readonly properties?: Record<string, ERPFieldSchema>;
}

/**
 * ERP Field Schema
 * Abstract field definition for simulation planning
 */
export interface ERPFieldSchema {
  /** Field type (abstract) */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'currency' | 'identifier';

  /** Optional description */
  readonly description?: string;

  /** Whether field is nullable */
  readonly nullable?: boolean;
}

/**
 * ERP Surface Contract
 * Defines an abstract ERP surface that can be referenced in simulation planning
 */
export interface ERPSurfaceContract {
  /** Unique identifier for this surface */
  readonly surfaceId: UUID;

  /** Human-readable name for the surface */
  readonly name: string;

  /** Domain this surface covers */
  readonly domain: ERPDomain;

  /** Contract version */
  readonly version: string;

  /** Capabilities provided by this surface */
  readonly capabilities: readonly ERPCapability[];

  /** Events that can originate from this surface */
  readonly events?: readonly ERPEventType[];

  /** Surface availability status for simulation */
  readonly status: RepositoryStatus;

  /** Optional metadata for simulation planning */
  readonly metadata?: ERPSurfaceMetadata;
}

/**
 * ERP Surface Metadata
 * Additional information for simulation planning
 */
export interface ERPSurfaceMetadata {
  /** Estimated latency characteristics for simulation */
  readonly simulatedLatencyMs?: ERPLatencyProfile;

  /** Throughput characteristics for capacity planning */
  readonly simulatedThroughput?: ERPThroughputProfile;

  /** Data volume characteristics */
  readonly dataVolumeProfile?: ERPDataVolumeProfile;

  /** Compliance and audit characteristics */
  readonly complianceProfile?: ERPComplianceProfile;
}

/**
 * Latency Profile for ERP operations
 */
export interface ERPLatencyProfile {
  /** P50 latency in milliseconds */
  readonly p50Ms: number;
  /** P90 latency in milliseconds */
  readonly p90Ms: number;
  /** P99 latency in milliseconds */
  readonly p99Ms: number;
}

/**
 * Throughput Profile for ERP operations
 */
export interface ERPThroughputProfile {
  /** Transactions per second */
  readonly transactionsPerSecond: number;
  /** Events per second */
  readonly eventsPerSecond: number;
  /** Concurrent operations limit */
  readonly maxConcurrentOperations: number;
}

/**
 * Data Volume Profile for simulation sizing
 */
export interface ERPDataVolumeProfile {
  /** Average record size in bytes */
  readonly avgRecordSizeBytes: number;
  /** Estimated records for simulation */
  readonly estimatedRecordCount: number;
  /** Data growth rate per period */
  readonly growthRatePercent?: number;
}

/**
 * Compliance Profile for audit requirements
 */
export interface ERPComplianceProfile {
  /** Data retention requirements */
  readonly retentionRequired: boolean;
  /** Audit trail requirements */
  readonly auditTrailRequired: boolean;
  /** Applicable compliance frameworks */
  readonly complianceFrameworks?: readonly string[];
}

/**
 * ERP Capability Reference
 * Used in simulation intents to reference ERP capabilities abstractly
 */
export interface ERPCapabilityReference {
  /** The capability being referenced */
  readonly capability: ERPCapabilityType;

  /** Domain for disambiguation */
  readonly domain: ERPDomain;

  /** Optional version constraint */
  readonly versionConstraint?: string;

  /** Optional priority for this reference */
  readonly priority?: Priority;

  /** Reason this capability is needed */
  readonly reason?: string;
}

/**
 * ERP Surface Reference
 * Used in simulation plans to reference ERP surfaces
 */
export interface ERPSurfaceReference {
  /** Reference to the surface contract */
  readonly surfaceId: UUID;

  /** Domain being referenced */
  readonly domain: ERPDomain;

  /** Specific capabilities being used */
  readonly capabilities: readonly ERPCapabilityReference[];

  /** Events being subscribed to */
  readonly subscribedEvents?: readonly ERPEventType[];

  /** Events being published */
  readonly publishedEvents?: readonly ERPEventType[];
}

/**
 * ERP Integration Requirement
 * Expresses a simulation's need for ERP capabilities
 */
export interface ERPIntegrationRequirement {
  /** Unique identifier */
  readonly id: UUID;

  /** Domain required */
  readonly domain: ERPDomain;

  /** Capabilities required from this domain */
  readonly requiredCapabilities: readonly ERPCapabilityReference[];

  /** Events that need to be consumed */
  readonly requiredEvents?: readonly ERPEventType[];

  /** Events that will be produced */
  readonly producedEvents?: readonly ERPEventType[];

  /** Priority of this requirement */
  readonly priority: Priority;

  /** Objective this requirement supports */
  readonly supportingObjectiveId?: UUID;
}

/**
 * Maps ERP domains to their associated capability types
 */
export const ERP_DOMAIN_CAPABILITIES: Record<ERPDomain, readonly ERPCapabilityType[]> = {
  FINANCE: [
    'general_ledger',
    'accounts_payable',
    'accounts_receivable',
    'budgeting',
    'financial_reporting',
    'tax_management',
    'treasury_management',
    'expense_management',
    'revenue_recognition',
    'cost_accounting',
  ],
  HUMAN_RESOURCES: [
    'employee_management',
    'payroll_processing',
    'benefits_administration',
    'recruitment',
    'performance_management',
    'learning_management',
    'time_attendance',
    'workforce_planning',
    'compensation_management',
    'succession_planning',
  ],
  OPERATIONS: [
    'production_planning',
    'quality_management',
    'maintenance_management',
    'shop_floor_control',
    'capacity_planning',
    'work_order_management',
    'bill_of_materials',
    'resource_scheduling',
    'process_automation',
    'operational_analytics',
  ],
  SUPPLY_CHAIN: [
    'inventory_management',
    'warehouse_management',
    'demand_forecasting',
    'order_management',
    'logistics_management',
    'supplier_management',
    'purchase_order_management',
    'shipment_tracking',
    'returns_management',
    'supply_chain_analytics',
  ],
  CUSTOMER_RELATIONSHIP: [
    'customer_data_management',
    'sales_management',
    'service_management',
    'contract_management',
    'customer_analytics',
    'campaign_management',
    'lead_management',
    'quote_management',
    'customer_portal',
    'case_management',
  ],
  PROJECT_MANAGEMENT: [
    'project_planning',
    'resource_allocation',
    'project_budgeting',
    'milestone_tracking',
    'project_reporting',
    'time_tracking',
    'project_billing',
    'risk_management',
    'collaboration',
    'portfolio_management',
  ],
  ASSET_MANAGEMENT: [
    'inventory_management',
    'maintenance_management',
    'work_order_management',
    'resource_scheduling',
  ],
  PROCUREMENT: [
    'supplier_management',
    'purchase_order_management',
    'contract_management',
    'expense_management',
  ],
} as const;

/**
 * Helper function to get domain for a capability
 */
export function getCapabilityDomain(capability: ERPCapabilityType): ERPDomain | undefined {
  for (const [domain, capabilities] of Object.entries(ERP_DOMAIN_CAPABILITIES)) {
    if ((capabilities as readonly string[]).includes(capability)) {
      return domain as ERPDomain;
    }
  }
  return undefined;
}

/**
 * Helper function to validate a capability belongs to its claimed domain
 */
export function validateCapabilityDomain(
  capability: ERPCapabilityType,
  claimedDomain: ERPDomain
): boolean {
  const capabilities = ERP_DOMAIN_CAPABILITIES[claimedDomain];
  return (capabilities as readonly string[]).includes(capability);
}
