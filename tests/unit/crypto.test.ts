/**
 * Unit tests for crypto utilities
 */

import {
  hashSHA256,
  generateDeterministicId,
  computeDecompositionHash,
  computeOrderingHash,
  serializeCanonical,
  verifyHash,
} from '../../src/utils/crypto.js';

describe('Crypto Utilities', () => {
  describe('hashSHA256', () => {
    it('should produce consistent hash for same input', () => {
      const input = 'test string';
      const hash1 = hashSHA256(input);
      const hash2 = hashSHA256(input);
      expect(hash1).toBe(hash2);
    });

    it('should produce 64-character hex string', () => {
      const hash = hashSHA256('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashSHA256('test1');
      const hash2 = hashSHA256('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashSHA256('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle unicode characters', () => {
      const hash = hashSHA256('こんにちは');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateDeterministicId', () => {
    it('should produce consistent ID for same inputs', () => {
      const id1 = generateDeterministicId('prefix', 'comp1', 'comp2');
      const id2 = generateDeterministicId('prefix', 'comp1', 'comp2');
      expect(id1).toBe(id2);
    });

    it('should produce valid UUID format', () => {
      const id = generateDeterministicId('test', 'component');
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });

    it('should produce different IDs for different prefixes', () => {
      const id1 = generateDeterministicId('prefix1', 'component');
      const id2 = generateDeterministicId('prefix2', 'component');
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different components', () => {
      const id1 = generateDeterministicId('prefix', 'comp1');
      const id2 = generateDeterministicId('prefix', 'comp2');
      expect(id1).not.toBe(id2);
    });

    it('should handle single component', () => {
      const id = generateDeterministicId('prefix');
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    });
  });

  describe('serializeCanonical', () => {
    it('should sort object keys deterministically', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(serializeCanonical(obj1)).toBe(serializeCanonical(obj2));
    });

    it('should handle nested objects', () => {
      const obj = { z: { b: 2, a: 1 }, a: 'value' };
      const serialized = serializeCanonical(obj);
      expect(serialized).toBe('{"a":"value","z":{"a":1,"b":2}}');
    });

    it('should handle arrays', () => {
      const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
      const serialized = serializeCanonical(arr);
      expect(serialized).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
    });

    it('should handle primitives', () => {
      expect(serializeCanonical('string')).toBe('"string"');
      expect(serializeCanonical(42)).toBe('42');
      expect(serializeCanonical(true)).toBe('true');
      expect(serializeCanonical(null)).toBe('null');
    });
  });

  describe('computeDecompositionHash', () => {
    it('should produce consistent hash for same data', () => {
      const data = { objectives: ['a', 'b'], executionOrder: [1, 2] };
      const hash1 = computeDecompositionHash(data);
      const hash2 = computeDecompositionHash(data);
      expect(hash1).toBe(hash2);
    });

    it('should be independent of object key order', () => {
      const data1 = { b: 2, a: 1 };
      const data2 = { a: 1, b: 2 };
      expect(computeDecompositionHash(data1)).toBe(computeDecompositionHash(data2));
    });
  });

  describe('computeOrderingHash', () => {
    it('should produce consistent hash for same ordering', () => {
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const hash1 = computeOrderingHash(items);
      const hash2 = computeOrderingHash(items);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different ordering', () => {
      const items1 = [{ id: 'a' }, { id: 'b' }];
      const items2 = [{ id: 'b' }, { id: 'a' }];
      expect(computeOrderingHash(items1)).not.toBe(computeOrderingHash(items2));
    });
  });

  describe('verifyHash', () => {
    it('should return true for matching hash', () => {
      const content = 'test content';
      const hash = hashSHA256(content);
      expect(verifyHash(content, hash)).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const content = 'test content';
      const wrongHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';
      expect(verifyHash(content, wrongHash)).toBe(false);
    });
  });
});
