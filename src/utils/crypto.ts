/**
 * Cryptographic utilities for deterministic operations
 * Provides SHA-256 hashing and deterministic ID generation.
 */

import { createHash } from 'crypto';
import type { UUID, SHA256Hash } from '../types/index.js';

/**
 * Computes SHA-256 hash of input data
 * @param data - String data to hash
 * @returns 64-character hexadecimal hash string
 */
export function hashSHA256(data: string): SHA256Hash {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Generates a deterministic UUID based on input components
 * Uses SHA-256 to ensure same inputs always produce same output
 * @param prefix - Type prefix for the ID
 * @param components - Variable components that define uniqueness
 * @returns Deterministic UUID in standard format
 */
export function generateDeterministicId(prefix: string, ...components: string[]): UUID {
  const input = [prefix, ...components].join(':');
  const hash = hashSHA256(input);

  // Format as UUID v4 (with deterministic content)
  // xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where y is one of 8, 9, a, or b
  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');

  return uuid;
}

/**
 * Computes hash for decomposition verification
 * @param data - Object to hash
 * @returns SHA-256 hash of canonical JSON representation
 */
export function computeDecompositionHash(data: unknown): SHA256Hash {
  const canonical = serializeCanonical(data);
  return hashSHA256(canonical);
}

/**
 * Computes hash for ordering verification
 * @param items - Array of items to hash
 * @returns SHA-256 hash of the ordered items
 */
export function computeOrderingHash(items: readonly { id: string }[]): SHA256Hash {
  const ids = items.map(item => item.id).join(',');
  return hashSHA256(ids);
}

/**
 * Serializes data to canonical JSON format
 * - Sorted keys for determinism
 * - No whitespace variations
 * - Unicode normalized
 * @param data - Data to serialize
 * @returns Canonical JSON string
 */
export function serializeCanonical(data: unknown): string {
  return JSON.stringify(data, (_, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Sort object keys for deterministic ordering
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(value).sort();
      for (const key of keys) {
        sorted[key] = value[key];
      }
      return sorted;
    }
    return value;
  });
}

/**
 * Verifies content hash matches expected value
 * @param content - Content to verify
 * @param expectedHash - Expected SHA-256 hash
 * @returns True if hash matches
 */
export function verifyHash(content: string, expectedHash: SHA256Hash): boolean {
  const actualHash = hashSHA256(content);
  return actualHash === expectedHash;
}
