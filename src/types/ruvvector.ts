/**
 * Ruvvector adapter type definitions
 * Defines the interface for ruvvector state management operations.
 */

import type { UUID, Timestamp, SHA256Hash, IsolationLevel } from './common.js';
import type { AuditEntry } from './simulation-plan.js';

/** Transaction context */
export interface TransactionContext {
  readonly id: UUID;
  readonly isolationLevel: IsolationLevel;
  readonly startTime: Timestamp;
  readonly operations: readonly TransactionOperation[];
}

/** Transaction operation */
export interface TransactionOperation {
  readonly id: UUID;
  readonly type: 'STORE' | 'RETRIEVE' | 'DELETE' | 'RELATION';
  readonly key?: string;
  readonly value?: unknown;
  readonly timestamp: Timestamp;
}

/** Commit result */
export interface CommitResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly commitRecord?: CommitRecord;
}

/** Commit record */
export interface CommitRecord {
  readonly transactionId: UUID;
  readonly committedAt: Timestamp;
  readonly operationCount: number;
}

/** Rollback result */
export interface RollbackResult {
  readonly success: boolean;
  readonly rolledBackOperations: number;
}

/** Storage record */
export interface StorageRecord {
  readonly key: string;
  readonly value: string;
  readonly checksum: SHA256Hash;
  readonly metadata: Record<string, unknown>;
  readonly storedAt: Timestamp;
  readonly version: number;
}

/** Store result */
export interface StoreResult {
  readonly key: string;
  readonly version: number;
  readonly checksum: SHA256Hash;
}

/** Retrieve result */
export interface RetrieveResult<T = unknown> {
  readonly found: boolean;
  readonly value?: T;
  readonly version?: number;
  readonly storedAt?: Timestamp;
}

/** Relation */
export interface Relation {
  readonly id: UUID;
  readonly fromEntity: UUID;
  readonly toEntity: UUID;
  readonly type: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Timestamp;
}

/** Relation pattern for queries */
export interface RelationPattern {
  readonly from?: UUID;
  readonly to?: UUID;
  readonly type?: string;
}

/** Traversal specification */
export interface TraversalSpec {
  readonly maxDepth: number;
  readonly relationTypes: readonly string[];
  readonly targetPattern: { readonly matches: (entity: string) => boolean };
}

/** Traversal result */
export interface TraversalResult {
  readonly startEntity: UUID;
  readonly pathsFound: readonly (readonly UUID[])[];
  readonly entitiesVisited: number;
}

/** Session configuration */
export interface SessionConfig {
  readonly seed: SHA256Hash;
  readonly namespace: string;
  readonly isolationLevel: IsolationLevel;
}

/** State snapshot */
export interface StateSnapshot {
  readonly timestamp: Timestamp;
  readonly memoryKeys: readonly string[];
  readonly relationCount: number;
  readonly checksum: SHA256Hash;
}

/** Audit trail */
export interface AuditTrail {
  readonly sessionId: UUID;
  readonly entries: readonly AuditEntry[];
  readonly summary: AuditSummary;
}

/** Audit summary */
export interface AuditSummary {
  readonly totalStages: number;
  readonly totalOperations: number;
  readonly errorCount: number;
  readonly startTime: Timestamp;
  readonly endTime: Timestamp;
  readonly finalContentHash?: SHA256Hash;
}

/** Ruvvector adapter interface */
export interface RuvvectorAdapter {
  // Session management
  initSession(config: SessionConfig): Promise<UUID>;
  resetSession(): Promise<void>;

  // State management
  store(key: string, value: unknown, metadata: Record<string, unknown>): Promise<StoreResult>;
  retrieve<T = unknown>(key: string, version?: number): Promise<RetrieveResult<T>>;
  delete(key: string): Promise<boolean>;

  // Relational operations
  createRelation(
    from: UUID,
    to: UUID,
    relationType: string,
    metadata?: Record<string, unknown>
  ): Promise<Relation>;
  queryRelations(pattern: RelationPattern): Promise<readonly Relation[]>;
  traverseGraph(startEntity: UUID, spec: TraversalSpec): Promise<TraversalResult>;

  // Audit trail
  appendAudit(sessionId: UUID, entry: AuditEntry): Promise<void>;
  getAuditTrail(sessionId: UUID): Promise<readonly AuditEntry[]>;

  // Transaction support
  beginTransaction(isolationLevel: IsolationLevel): Promise<TransactionContext>;
  commit(tx: TransactionContext): Promise<CommitResult>;
  rollback(tx: TransactionContext): Promise<RollbackResult>;
}
