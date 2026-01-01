/**
 * Unit tests for ruvvector adapter
 */

import {
  InMemoryRuvvectorAdapter,
  getRuvvectorAdapter,
  resetRuvvectorAdapter,
} from '../../src/adapters/ruvvector-adapter.js';
import { KeyFormatError, IntegrityError } from '../../src/types/errors.js';

describe('InMemoryRuvvectorAdapter', () => {
  let adapter: InMemoryRuvvectorAdapter;

  beforeEach(() => {
    adapter = new InMemoryRuvvectorAdapter();
  });

  afterEach(() => {
    adapter.clear();
  });

  describe('initSession', () => {
    it('should create a session with deterministic ID', async () => {
      const sessionId1 = await adapter.initSession({
        seed: 'test-seed',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      adapter.clear();

      const sessionId2 = await adapter.initSession({
        seed: 'test-seed',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      expect(sessionId1).toBe(sessionId2);
    });
  });

  describe('store and retrieve', () => {
    it('should store and retrieve a value', async () => {
      const result = await adapter.store('test:key', { data: 'value' }, {});
      expect(result.key).toBe('test:key');
      expect(result.version).toBe(1);

      const retrieved = await adapter.retrieve('test:key');
      expect(retrieved.found).toBe(true);
      expect(retrieved.value).toEqual({ data: 'value' });
    });

    it('should increment version on update', async () => {
      await adapter.store('test:key', { v: 1 }, {});
      const result = await adapter.store('test:key', { v: 2 }, {});
      expect(result.version).toBe(2);
    });

    it('should retrieve specific version', async () => {
      await adapter.store('test:key', { v: 1 }, {});
      await adapter.store('test:key', { v: 2 }, {});

      const v1 = await adapter.retrieve('test:key', 1);
      expect(v1.value).toEqual({ v: 1 });

      const v2 = await adapter.retrieve('test:key', 2);
      expect(v2.value).toEqual({ v: 2 });
    });

    it('should return found=false for non-existent key', async () => {
      const result = await adapter.retrieve('nonexistent:key');
      expect(result.found).toBe(false);
    });

    it('should validate key format', async () => {
      await expect(adapter.store('', { data: 'value' }, {}))
        .rejects.toThrow(KeyFormatError);

      await expect(adapter.store('invalid key!', { data: 'value' }, {}))
        .rejects.toThrow(KeyFormatError);
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await adapter.store('test:key', { data: 'value' }, {});
      const deleted = await adapter.delete('test:key');
      expect(deleted).toBe(true);

      const result = await adapter.retrieve('test:key');
      expect(result.found).toBe(false);
    });

    it('should return false for non-existent key', async () => {
      const deleted = await adapter.delete('nonexistent:key');
      expect(deleted).toBe(false);
    });
  });

  describe('createRelation and queryRelations', () => {
    it('should create a relation', async () => {
      const relation = await adapter.createRelation('entity1', 'entity2', 'DEPENDS_ON');
      expect(relation.fromEntity).toBe('entity1');
      expect(relation.toEntity).toBe('entity2');
      expect(relation.type).toBe('DEPENDS_ON');
    });

    it('should query relations by from entity', async () => {
      await adapter.createRelation('entity1', 'entity2', 'DEPENDS_ON');
      await adapter.createRelation('entity1', 'entity3', 'DEPENDS_ON');
      await adapter.createRelation('entity2', 'entity3', 'DEPENDS_ON');

      const relations = await adapter.queryRelations({ from: 'entity1' });
      expect(relations.length).toBe(2);
    });

    it('should query relations by to entity', async () => {
      await adapter.createRelation('entity1', 'entity3', 'DEPENDS_ON');
      await adapter.createRelation('entity2', 'entity3', 'DEPENDS_ON');

      const relations = await adapter.queryRelations({ to: 'entity3' });
      expect(relations.length).toBe(2);
    });

    it('should query relations by type', async () => {
      await adapter.createRelation('entity1', 'entity2', 'DEPENDS_ON');
      await adapter.createRelation('entity1', 'entity3', 'OWNS');

      const relations = await adapter.queryRelations({ type: 'DEPENDS_ON' });
      expect(relations.length).toBe(1);
    });
  });

  describe('traverseGraph', () => {
    it('should traverse graph from start entity', async () => {
      await adapter.createRelation('a', 'b', 'LINK');
      await adapter.createRelation('b', 'c', 'LINK');
      await adapter.createRelation('c', 'd', 'LINK');

      const result = await adapter.traverseGraph('a', {
        maxDepth: 5,
        relationTypes: ['LINK'],
        targetPattern: { matches: (entity) => entity === 'd' },
      });

      expect(result.pathsFound.length).toBeGreaterThan(0);
      expect(result.entitiesVisited).toBeGreaterThanOrEqual(4);
    });

    it('should respect maxDepth', async () => {
      await adapter.createRelation('a', 'b', 'LINK');
      await adapter.createRelation('b', 'c', 'LINK');
      await adapter.createRelation('c', 'd', 'LINK');

      const result = await adapter.traverseGraph('a', {
        maxDepth: 1,
        relationTypes: ['LINK'],
        targetPattern: { matches: (entity) => entity === 'd' },
      });

      expect(result.pathsFound.length).toBe(0);
    });
  });

  describe('appendAudit and getAuditTrail', () => {
    it('should append and retrieve audit entries', async () => {
      const sessionId = await adapter.initSession({
        seed: 'test',
        namespace: 'test',
        isolationLevel: 'SERIALIZABLE',
      });

      await adapter.appendAudit(sessionId, {
        stage: 'TEST',
        operation: 'TEST_OP',
        timestamp: new Date().toISOString(),
        decision: 'SUCCESS',
      });

      const trail = await adapter.getAuditTrail(sessionId);
      expect(trail.length).toBe(1);
      expect(trail[0]?.stage).toBe('TEST');
    });
  });

  describe('transactions', () => {
    it('should begin and commit transaction', async () => {
      const tx = await adapter.beginTransaction('SERIALIZABLE');
      expect(tx.id).toBeDefined();

      const result = await adapter.commit(tx);
      expect(result.success).toBe(true);
    });

    it('should rollback transaction', async () => {
      const tx = await adapter.beginTransaction('SERIALIZABLE');
      const result = await adapter.rollback(tx);
      expect(result.success).toBe(true);
    });

    it('should fail commit for non-existent transaction', async () => {
      const fakeTx = {
        id: 'non-existent-tx',
        isolationLevel: 'SERIALIZABLE' as const,
        startTime: new Date().toISOString(),
        operations: [],
      };
      const result = await adapter.commit(fakeTx);
      expect(result.success).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('should list all keys', async () => {
      await adapter.store('test:key1', {}, {});
      await adapter.store('test:key2', {}, {});
      await adapter.store('other:key', {}, {});

      const keys = adapter.listKeys();
      expect(keys.length).toBe(3);
    });

    it('should filter keys by pattern', async () => {
      await adapter.store('test:key1', {}, {});
      await adapter.store('test:key2', {}, {});
      await adapter.store('other:key', {}, {});

      const keys = adapter.listKeys('test:');
      expect(keys.length).toBe(2);
    });
  });
});

describe('getRuvvectorAdapter', () => {
  afterEach(() => {
    resetRuvvectorAdapter();
  });

  it('should return singleton instance', () => {
    const adapter1 = getRuvvectorAdapter();
    const adapter2 = getRuvvectorAdapter();
    expect(adapter1).toBe(adapter2);
  });

  it('should reset singleton on resetRuvvectorAdapter', () => {
    const adapter1 = getRuvvectorAdapter();
    resetRuvvectorAdapter();
    const adapter2 = getRuvvectorAdapter();
    expect(adapter1).not.toBe(adapter2);
  });
});
