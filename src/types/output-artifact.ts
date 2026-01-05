/**
 * Output Artifact Type Definitions for the Agentics Simulation Planner
 *
 * This module defines the specification for output artifacts produced by simulation plans.
 * These types describe WHAT artifacts will be generated, not HOW they are produced.
 * The execution engine is responsible for actually generating these artifacts based on
 * the specifications defined here.
 *
 * Output artifacts serve as the interface between simulation execution and downstream
 * systems including dashboards, analytics pipelines, ERP integrations, and audit systems.
 *
 * @module output-artifact
 */

import type { UUID } from './common.js';

/**
 * Type literal union defining the category of output artifact.
 *
 * Each artifact type serves a specific purpose in the simulation ecosystem:
 * - SIMULATION_RESULTS: Primary output containing simulation outcomes and decisions
 * - METRICS_REPORT: Aggregated performance and business metrics
 * - COST_ANALYSIS: Financial impact and resource cost breakdown
 * - PERFORMANCE_TRACE: Detailed execution timing and resource utilization
 * - AUDIT_LOG: Immutable record of all actions and decisions for compliance
 * - AGENT_STATE_SNAPSHOT: Point-in-time capture of agent states
 * - WORKFLOW_EXECUTION_LOG: Step-by-step workflow execution details
 * - ERP_SYNC_MANIFEST: Data synchronization manifest for ERP systems
 * - COMPLIANCE_REPORT: Regulatory and policy compliance documentation
 * - CUSTOM: User-defined artifact type for extensibility
 */
export type OutputArtifactType =
  | 'SIMULATION_RESULTS'
  | 'METRICS_REPORT'
  | 'COST_ANALYSIS'
  | 'PERFORMANCE_TRACE'
  | 'AUDIT_LOG'
  | 'AGENT_STATE_SNAPSHOT'
  | 'WORKFLOW_EXECUTION_LOG'
  | 'ERP_SYNC_MANIFEST'
  | 'COMPLIANCE_REPORT'
  | 'CUSTOM';

/**
 * Supported serialization formats for output artifacts.
 *
 * Format selection impacts:
 * - Storage efficiency (PARQUET, AVRO are columnar/compact)
 * - Human readability (JSON, YAML)
 * - Schema evolution support (PROTOBUF, AVRO)
 * - Interoperability with downstream systems
 */
export type ArtifactFormat = 'JSON' | 'YAML' | 'PROTOBUF' | 'AVRO' | 'PARQUET';

/**
 * Schema definition types for artifact validation.
 *
 * Determines how the artifact structure is validated:
 * - JSON_SCHEMA: Standard JSON Schema (draft-07 or later)
 * - PROTOBUF: Protocol Buffers schema definition
 * - AVRO: Apache Avro schema format
 * - CUSTOM: Implementation-specific schema format
 */
export type SchemaType = 'JSON_SCHEMA' | 'PROTOBUF' | 'AVRO' | 'CUSTOM';

/**
 * Destination types for artifact delivery.
 *
 * Specifies where artifacts are persisted or transmitted:
 * - OBJECT_STORAGE: Cloud object storage (S3, GCS, Azure Blob)
 * - MESSAGE_QUEUE: Message broker (Kafka, RabbitMQ, SQS)
 * - DATABASE: Relational or NoSQL database
 * - WEBHOOK: HTTP endpoint for push delivery
 * - FILE_SYSTEM: Local or network file system
 */
export type DestinationType = 'OBJECT_STORAGE' | 'MESSAGE_QUEUE' | 'DATABASE' | 'WEBHOOK' | 'FILE_SYSTEM';

/**
 * Credential resolution strategies for destination authentication.
 *
 * - ENVIRONMENT: Credentials from environment variables
 * - VAULT: Secrets manager (HashiCorp Vault, AWS Secrets Manager)
 * - IAM: Cloud IAM role-based authentication
 */
export type CredentialStrategy = 'ENVIRONMENT' | 'VAULT' | 'IAM';

/**
 * Partitioning strategies for distributed artifact storage.
 *
 * - TIME_BASED: Partition by timestamp (hourly, daily, monthly)
 * - HASH: Hash-based distribution across partitions
 * - RANGE: Range-based partitioning on a key field
 * - NONE: No partitioning, single output
 */
export type PartitionType = 'TIME_BASED' | 'HASH' | 'RANGE' | 'NONE';

/**
 * Consumer types for downstream artifact consumption.
 *
 * - SERVICE: Backend microservice or API
 * - PIPELINE: Data processing pipeline (ETL, ML)
 * - DASHBOARD: Visualization and reporting system
 * - API: External API consumer
 * - HUMAN: Manual review or analysis
 */
export type ConsumerType = 'SERVICE' | 'PIPELINE' | 'DASHBOARD' | 'API' | 'HUMAN';

/**
 * Refresh frequency for consumer data requirements.
 *
 * - REALTIME: Streaming or immediate delivery
 * - BATCH_HOURLY: Hourly batch processing
 * - BATCH_DAILY: Daily batch processing
 * - ON_DEMAND: Consumer-initiated retrieval
 */
export type RefreshFrequency = 'REALTIME' | 'BATCH_HOURLY' | 'BATCH_DAILY' | 'ON_DEMAND';

/**
 * Schema definition for artifact structure validation.
 *
 * Defines how the artifact's data structure is specified and validated.
 * Either schemaUri (external reference) or inlineSchema (embedded) should be provided,
 * but not both. If both are null, the schema is considered unvalidated.
 *
 * @example
 * ```typescript
 * const schema: ArtifactSchema = {
 *   schemaType: 'JSON_SCHEMA',
 *   schemaVersion: '2024.1.0',
 *   schemaUri: 'https://schemas.example.com/simulation-results-v1.json',
 *   inlineSchema: null
 * };
 * ```
 */
export interface ArtifactSchema {
  /**
   * The type of schema definition used for validation.
   */
  readonly schemaType: SchemaType;

  /**
   * Semantic version of the schema definition.
   * Should follow semver format (MAJOR.MINOR.PATCH).
   */
  readonly schemaVersion: string;

  /**
   * URI reference to an external schema definition.
   * Mutually exclusive with inlineSchema - only one should be non-null.
   */
  readonly schemaUri: string | null;

  /**
   * Inline schema definition embedded in the specification.
   * Mutually exclusive with schemaUri - only one should be non-null.
   * The structure depends on schemaType.
   */
  readonly inlineSchema: Record<string, unknown> | null;
}

/**
 * Partitioning strategy for distributed artifact storage.
 *
 * Defines how artifacts are divided across storage partitions for
 * improved query performance and data management.
 *
 * @example
 * ```typescript
 * const partitioning: PartitioningStrategy = {
 *   type: 'TIME_BASED',
 *   keyField: 'timestamp',
 *   partitionCount: null // Determined by time granularity
 * };
 * ```
 */
export interface PartitioningStrategy {
  /**
   * The partitioning algorithm to apply.
   */
  readonly type: PartitionType;

  /**
   * Field name used as the partition key.
   * Required for TIME_BASED, HASH, and RANGE types.
   * Null for NONE type.
   */
  readonly keyField: string | null;

  /**
   * Number of partitions for HASH partitioning.
   * For TIME_BASED, this may represent time buckets.
   * Null when not applicable.
   */
  readonly partitionCount: number | null;
}

/**
 * Destination configuration for artifact delivery.
 *
 * Specifies where and how artifacts are persisted or transmitted.
 * The uri format depends on the destinationType.
 *
 * @example
 * ```typescript
 * const destination: ArtifactDestination = {
 *   destinationType: 'OBJECT_STORAGE',
 *   uri: 's3://simulation-artifacts/results/',
 *   credentials: 'IAM',
 *   partitioning: {
 *     type: 'TIME_BASED',
 *     keyField: 'simulationDate',
 *     partitionCount: null
 *   }
 * };
 * ```
 */
export interface ArtifactDestination {
  /**
   * The type of destination system.
   */
  readonly destinationType: DestinationType;

  /**
   * URI or connection string for the destination.
   * Format varies by destination type:
   * - OBJECT_STORAGE: s3://bucket/prefix, gs://bucket/prefix
   * - MESSAGE_QUEUE: kafka://broker:port/topic, amqp://host/queue
   * - DATABASE: postgresql://host:port/db, mongodb://host/collection
   * - WEBHOOK: https://endpoint.example.com/artifacts
   * - FILE_SYSTEM: file:///path/to/directory or /path/to/directory
   */
  readonly uri: string;

  /**
   * Strategy for resolving authentication credentials.
   * Null if the destination does not require authentication.
   */
  readonly credentials: CredentialStrategy | null;

  /**
   * Partitioning strategy for distributed storage.
   * Null if partitioning is not applicable or not configured.
   */
  readonly partitioning: PartitioningStrategy | null;
}

/**
 * Lifecycle management configuration for artifacts.
 *
 * Defines retention, archival, and versioning policies for artifacts.
 * These settings ensure compliance with data governance requirements
 * and optimize storage costs.
 *
 * @example
 * ```typescript
 * const lifecycle: ArtifactLifecycle = {
 *   retentionDays: 365,
 *   archiveAfterDays: 90,
 *   immutable: true,
 *   versioned: true
 * };
 * ```
 */
export interface ArtifactLifecycle {
  /**
   * Number of days to retain the artifact before deletion.
   * Must be a positive integer. Use a large value (e.g., 36500) for
   * indefinite retention.
   */
  readonly retentionDays: number;

  /**
   * Number of days after creation to move artifact to archive storage.
   * Archive storage typically has lower cost but higher retrieval latency.
   * Null if archival is not configured.
   */
  readonly archiveAfterDays: number | null;

  /**
   * Whether the artifact is immutable after creation.
   * Immutable artifacts cannot be modified or overwritten.
   * Required true for audit logs and compliance reports.
   */
  readonly immutable: boolean;

  /**
   * Whether to maintain version history for the artifact.
   * When true, updates create new versions instead of replacing.
   */
  readonly versioned: boolean;
}

/**
 * Downstream consumer specification for an artifact.
 *
 * Defines a system or entity that consumes the artifact and their
 * specific requirements for data access and freshness.
 *
 * @example
 * ```typescript
 * const consumer: ConsumerSpec = {
 *   consumerId: 'analytics-dashboard',
 *   consumerType: 'DASHBOARD',
 *   requiredFields: ['totalCost', 'resourceUtilization', 'completionRate'],
 *   refreshFrequency: 'BATCH_HOURLY'
 * };
 * ```
 */
export interface ConsumerSpec {
  /**
   * Unique identifier for the consumer system.
   * Should be a stable, human-readable identifier.
   */
  readonly consumerId: string;

  /**
   * Category of the consumer system.
   */
  readonly consumerType: ConsumerType;

  /**
   * List of field names required by this consumer.
   * Used for validation and documentation purposes.
   * The artifact schema must include all required fields.
   */
  readonly requiredFields: readonly string[];

  /**
   * How frequently the consumer needs fresh data.
   * Influences delivery mechanism and caching strategies.
   */
  readonly refreshFrequency: RefreshFrequency;
}

/**
 * Complete specification for an output artifact from simulation.
 *
 * This interface defines all aspects of an artifact that will be produced
 * by simulation execution. It serves as a contract between the simulation
 * planning system and downstream consumers.
 *
 * The specification is declarative - it describes WHAT will be produced,
 * not HOW to produce it. The execution engine uses this specification to:
 * 1. Generate artifacts in the correct format
 * 2. Validate output against the schema
 * 3. Deliver artifacts to configured destinations
 * 4. Apply lifecycle policies
 *
 * @example
 * ```typescript
 * const simulationResultsArtifact: OutputArtifactSpec = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   name: 'workforce-simulation-results',
 *   artifactType: 'SIMULATION_RESULTS',
 *   format: 'JSON',
 *   schema: {
 *     schemaType: 'JSON_SCHEMA',
 *     schemaVersion: '1.0.0',
 *     schemaUri: 'https://schemas.example.com/simulation-results.json',
 *     inlineSchema: null
 *   },
 *   destination: {
 *     destinationType: 'OBJECT_STORAGE',
 *     uri: 's3://simulation-outputs/results/',
 *     credentials: 'IAM',
 *     partitioning: {
 *       type: 'TIME_BASED',
 *       keyField: 'simulationTimestamp',
 *       partitionCount: null
 *     }
 *   },
 *   lifecycle: {
 *     retentionDays: 365,
 *     archiveAfterDays: 90,
 *     immutable: true,
 *     versioned: true
 *   },
 *   consumers: [
 *     {
 *       consumerId: 'erp-integration',
 *       consumerType: 'SERVICE',
 *       requiredFields: ['recommendations', 'costImpact'],
 *       refreshFrequency: 'REALTIME'
 *     }
 *   ]
 * };
 * ```
 */
export interface OutputArtifactSpec {
  /**
   * Unique identifier for this artifact specification.
   * UUID v4 format.
   */
  readonly id: UUID;

  /**
   * Human-readable name for the artifact.
   * Should be descriptive and follow naming conventions (kebab-case recommended).
   */
  readonly name: string;

  /**
   * Category of output artifact.
   * Determines the expected structure and purpose of the artifact.
   */
  readonly artifactType: OutputArtifactType;

  /**
   * Serialization format for the artifact data.
   */
  readonly format: ArtifactFormat;

  /**
   * Schema definition for artifact structure validation.
   */
  readonly schema: ArtifactSchema;

  /**
   * Destination configuration for artifact delivery.
   */
  readonly destination: ArtifactDestination;

  /**
   * Lifecycle management policies for the artifact.
   */
  readonly lifecycle: ArtifactLifecycle;

  /**
   * List of downstream consumers for this artifact.
   * Empty array if no specific consumers are defined.
   */
  readonly consumers: readonly ConsumerSpec[];
}

/**
 * Manifest containing all output artifacts for a simulation plan.
 *
 * This interface aggregates all artifact specifications for a complete
 * simulation execution and provides metadata about the collection.
 *
 * The generationOrder field defines the sequence in which artifacts
 * should be generated, accounting for dependencies between artifacts
 * (e.g., audit logs may reference simulation results).
 *
 * @example
 * ```typescript
 * const manifest: OutputArtifactManifest = {
 *   artifacts: [simulationResultsArtifact, metricsArtifact, auditLogArtifact],
 *   totalEstimatedSizeBytes: 1048576,
 *   generationOrder: [
 *     simulationResultsArtifact.id,
 *     metricsArtifact.id,
 *     auditLogArtifact.id
 *   ]
 * };
 * ```
 */
export interface OutputArtifactManifest {
  /**
   * Collection of all artifact specifications for the simulation plan.
   * Each artifact is uniquely identified by its id field.
   */
  readonly artifacts: readonly OutputArtifactSpec[];

  /**
   * Estimated total size in bytes for all artifacts combined.
   * Used for capacity planning and resource allocation.
   * This is an estimate; actual size may vary based on simulation data.
   */
  readonly totalEstimatedSizeBytes: number;

  /**
   * Ordered list of artifact IDs defining generation sequence.
   * Artifacts should be generated in this order to respect dependencies.
   * All IDs must reference artifacts in the artifacts array.
   */
  readonly generationOrder: readonly UUID[];
}

/**
 * Type guard to check if a value is a valid OutputArtifactType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid OutputArtifactType
 */
export function isOutputArtifactType(value: unknown): value is OutputArtifactType {
  const validTypes: readonly OutputArtifactType[] = [
    'SIMULATION_RESULTS',
    'METRICS_REPORT',
    'COST_ANALYSIS',
    'PERFORMANCE_TRACE',
    'AUDIT_LOG',
    'AGENT_STATE_SNAPSHOT',
    'WORKFLOW_EXECUTION_LOG',
    'ERP_SYNC_MANIFEST',
    'COMPLIANCE_REPORT',
    'CUSTOM',
  ];
  return typeof value === 'string' && validTypes.includes(value as OutputArtifactType);
}

/**
 * Type guard to check if a value is a valid ArtifactFormat.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ArtifactFormat
 */
export function isArtifactFormat(value: unknown): value is ArtifactFormat {
  const validFormats: readonly ArtifactFormat[] = ['JSON', 'YAML', 'PROTOBUF', 'AVRO', 'PARQUET'];
  return typeof value === 'string' && validFormats.includes(value as ArtifactFormat);
}

/**
 * Type guard to check if a value is a valid DestinationType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid DestinationType
 */
export function isDestinationType(value: unknown): value is DestinationType {
  const validTypes: readonly DestinationType[] = [
    'OBJECT_STORAGE',
    'MESSAGE_QUEUE',
    'DATABASE',
    'WEBHOOK',
    'FILE_SYSTEM',
  ];
  return typeof value === 'string' && validTypes.includes(value as DestinationType);
}
