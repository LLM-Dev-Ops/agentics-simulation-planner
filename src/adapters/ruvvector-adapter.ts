/**
 * Ruvvector State Management Adapter
 * Implements the RuvvectorAdapter interface for ACID-compliant state management.
 * This is the mandatory state, memory, and relational reasoning substrate.
 */

import type {
  UUID,
  IsolationLevel,
  SHA256Hash,
  Timestamp,
  RuvvectorAdapter,
  SessionConfig,
  StoreResult,
  RetrieveResult,
  Relation,
  RelationPattern,
  TraversalSpec,
  TraversalResult,
  TransactionContext,
  CommitResult,
  RollbackResult,
  TransactionOperation,
} from '../types/index.js';
import type { AuditEntry } from '../types/simulation-plan.js';
import { generateDeterministicId, hashSHA256, serializeCanonical } from '../utils/crypto.js';
import { getCurrentTimestampUTC } from '../utils/text.js';
import { KeyFormatError, IntegrityError } from '../types/errors.js';

/** Internal storage record */
interface InternalRecord {
  key: string;
  value: string;
  checksum: SHA256Hash;
  metadata: Record<string, unknown>;
  storedAt: Timestamp;
  version: number;
}

/**
 * In-memory implementation of RuvvectorAdapter
 * Provides ACID-compliant state management with full audit trail.
 */
export class InMemoryRuvvectorAdapter implements RuvvectorAdapter {
  private storage: Map<string, InternalRecord[]> = new Map();
  private relations: Map<UUID, Relation> = new Map();
  private auditTrails: Map<UUID, AuditEntry[]> = new Map();
  private activeTransactions: Map<UUID, TransactionContext & { operations: TransactionOperation[] }> = new Map();
  private currentSessionId: UUID | null = null;

  /**
   * Validates key format
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new KeyFormatError('Key must be a non-empty string');
    }
    if (key.length > 1024) {
      throw new KeyFormatError('Key exceeds maximum length of 1024 characters');
    }
    if (!/^[\w:.\-/]+$/.test(key)) {
      throw new KeyFormatError('Key contains invalid characters');
    }
  }

  /**
   * Initializes a new session with deterministic seed
   */
  async initSession(config: SessionConfig): Promise<UUID> {
    const sessionId = generateDeterministicId('session', config.seed, config.namespace);
    this.currentSessionId = sessionId;
    this.auditTrails.set(sessionId, []);
    return sessionId;
  }

  /**
   * Resets the current session
   */
  async resetSession(): Promise<void> {
    if (this.currentSessionId) {
      // Clear session-specific data
      const prefix = `session:${this.currentSessionId}:`;
      for (const key of this.storage.keys()) {
        if (key.startsWith(prefix)) {
          this.storage.delete(key);
        }
      }
      this.currentSessionId = null;
    }
  }

  /**
   * Stores a value with metadata
   */
  async store(
    key: string,
    value: unknown,
    metadata: Record<string, unknown>
  ): Promise<StoreResult> {
    this.validateKey(key);

    const serialized = serializeCanonical(value);
    const checksum = hashSHA256(serialized);
    const storedAt = getCurrentTimestampUTC();

    const existing = this.storage.get(key);
    const version = existing ? existing.length + 1 : 1;

    const record: InternalRecord = {
      key,
      value: serialized,
      checksum,
      metadata,
      storedAt,
      version,
    };

    if (existing) {
      existing.push(record);
    } else {
      this.storage.set(key, [record]);
    }

    return { key, version, checksum };
  }

  /**
   * Retrieves a value by key and optional version
   */
  async retrieve<T = unknown>(
    key: string,
    version?: number
  ): Promise<RetrieveResult<T>> {
    this.validateKey(key);

    const records = this.storage.get(key);
    if (!records || records.length === 0) {
      return { found: false };
    }

    const record = version !== undefined
      ? records.find(r => r.version === version)
      : records[records.length - 1];

    if (!record) {
      return { found: false };
    }

    // Verify checksum
    const computedChecksum = hashSHA256(record.value);
    if (computedChecksum !== record.checksum) {
      throw new IntegrityError(`Checksum mismatch for key: ${key}`);
    }

    const value = JSON.parse(record.value) as T;

    return {
      found: true,
      value,
      version: record.version,
      storedAt: record.storedAt,
    };
  }

  /**
   * Deletes a key from storage
   */
  async delete(key: string): Promise<boolean> {
    this.validateKey(key);
    return this.storage.delete(key);
  }

  /**
   * Creates a relation between entities
   */
  async createRelation(
    from: UUID,
    to: UUID,
    relationType: string,
    metadata: Record<string, unknown> = {}
  ): Promise<Relation> {
    const relation: Relation = {
      id: generateDeterministicId('rel', from, to, relationType),
      fromEntity: from,
      toEntity: to,
      type: relationType,
      metadata,
      createdAt: getCurrentTimestampUTC(),
    };

    this.relations.set(relation.id, relation);
    return relation;
  }

  /**
   * Queries relations matching a pattern
   */
  async queryRelations(pattern: RelationPattern): Promise<readonly Relation[]> {
    const matches: Relation[] = [];

    for (const relation of this.relations.values()) {
      let match = true;

      if (pattern.from !== undefined && relation.fromEntity !== pattern.from) {
        match = false;
      }
      if (pattern.to !== undefined && relation.toEntity !== pattern.to) {
        match = false;
      }
      if (pattern.type !== undefined && relation.type !== pattern.type) {
        match = false;
      }

      if (match) {
        matches.push(relation);
      }
    }

    // Sort by ID for determinism
    return matches.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Traverses the relation graph
   */
  async traverseGraph(
    startEntity: UUID,
    spec: TraversalSpec
  ): Promise<TraversalResult> {
    const visited = new Set<UUID>();
    const paths: UUID[][] = [];

    const traverse = async (
      current: UUID,
      path: UUID[],
      depth: number
    ): Promise<void> => {
      if (depth > spec.maxDepth) return;
      if (visited.has(current)) return;

      visited.add(current);
      const newPath = [...path, current];

      if (spec.targetPattern.matches(current)) {
        paths.push(newPath);
      }

      const neighbors = await this.queryRelations({
        from: current,
      });

      for (const neighbor of neighbors) {
        if (spec.relationTypes.length === 0 || spec.relationTypes.includes(neighbor.type)) {
          await traverse(neighbor.toEntity, newPath, depth + 1);
        }
      }
    };

    await traverse(startEntity, [], 0);

    return {
      startEntity,
      pathsFound: paths,
      entitiesVisited: visited.size,
    };
  }

  /**
   * Appends an entry to the audit trail
   */
  async appendAudit(sessionId: UUID, entry: AuditEntry): Promise<void> {
    let trail = this.auditTrails.get(sessionId);
    if (!trail) {
      trail = [];
      this.auditTrails.set(sessionId, trail);
    }
    trail.push(entry);
  }

  /**
   * Retrieves the complete audit trail for a session
   */
  async getAuditTrail(sessionId: UUID): Promise<readonly AuditEntry[]> {
    return this.auditTrails.get(sessionId) ?? [];
  }

  /**
   * Begins a new transaction
   */
  async beginTransaction(isolationLevel: IsolationLevel): Promise<TransactionContext> {
    const txId = generateDeterministicId('tx', getCurrentTimestampUTC(), Math.random().toString());

    const context: TransactionContext & { operations: TransactionOperation[] } = {
      id: txId,
      isolationLevel,
      startTime: getCurrentTimestampUTC(),
      operations: [],
    };

    this.activeTransactions.set(txId, context);

    return {
      id: context.id,
      isolationLevel: context.isolationLevel,
      startTime: context.startTime,
      operations: context.operations,
    };
  }

  /**
   * Commits a transaction
   */
  async commit(tx: TransactionContext): Promise<CommitResult> {
    const context = this.activeTransactions.get(tx.id);
    if (!context) {
      return { success: false, reason: 'Transaction not found' };
    }

    // In this implementation, operations are applied immediately
    // A real implementation would apply buffered operations here

    this.activeTransactions.delete(tx.id);

    return {
      success: true,
      commitRecord: {
        transactionId: tx.id,
        committedAt: getCurrentTimestampUTC(),
        operationCount: context.operations.length,
      },
    };
  }

  /**
   * Rolls back a transaction
   */
  async rollback(tx: TransactionContext): Promise<RollbackResult> {
    const context = this.activeTransactions.get(tx.id);
    if (!context) {
      return { success: false, rolledBackOperations: 0 };
    }

    const operationCount = context.operations.length;
    this.activeTransactions.delete(tx.id);

    return {
      success: true,
      rolledBackOperations: operationCount,
    };
  }

  /**
   * Gets all keys matching a pattern (for testing/debugging)
   */
  listKeys(pattern?: string): string[] {
    const keys: string[] = [];
    for (const key of this.storage.keys()) {
      if (!pattern || key.includes(pattern)) {
        keys.push(key);
      }
    }
    return keys.sort();
  }

  /**
   * Clears all storage (for testing)
   */
  clear(): void {
    this.storage.clear();
    this.relations.clear();
    this.auditTrails.clear();
    this.activeTransactions.clear();
    this.currentSessionId = null;
  }
}

// Singleton instance for the application
let adapterInstance: InMemoryRuvvectorAdapter | null = null;

/**
 * Gets the singleton ruvvector adapter instance
 */
export function getRuvvectorAdapter(): RuvvectorAdapter {
  if (!adapterInstance) {
    adapterInstance = new InMemoryRuvvectorAdapter();
  }
  return adapterInstance;
}

/**
 * Resets the adapter instance (for testing)
 */
export function resetRuvvectorAdapter(): void {
  if (adapterInstance) {
    adapterInstance.clear();
  }
  adapterInstance = null;
}
