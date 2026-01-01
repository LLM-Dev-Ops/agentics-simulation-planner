/**
 * Text processing utilities for deterministic NLP operations
 * Provides normalization, tokenization, and text analysis functions.
 */

import type { Timestamp } from '../types/index.js';

/** Maximum allowed intent length in characters */
export const MAX_INTENT_LENGTH = 100000;

/**
 * Normalizes input text for deterministic processing
 * - Removes control characters (preserves newlines)
 * - Normalizes Unicode to NFC form
 * - Collapses multiple whitespace to single space
 * - Trims leading/trailing whitespace
 * @param text - Raw input text
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  // Remove control characters except newlines and tabs
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize Unicode to NFC form for determinism
  const normalized = cleaned.normalize('NFC');

  // Collapse multiple whitespace to single space (preserve newlines)
  const collapsed = normalized.replace(/[ \t]+/g, ' ');

  // Trim leading/trailing whitespace
  return collapsed.trim();
}

/**
 * Gets current timestamp in UTC ISO 8601 format
 * @returns ISO 8601 timestamp string
 */
export function getCurrentTimestampUTC(): Timestamp {
  return new Date().toISOString();
}

/**
 * Stable sort implementation that maintains insertion order for equal elements
 * @param array - Array to sort (not mutated)
 * @param keyFn - Function to extract sort key
 * @returns New sorted array
 */
export function stableSort<T>(
  array: readonly T[],
  keyFn: (item: T) => string | number | readonly (string | number)[]
): T[] {
  // Create array with original indices
  const indexed = array.map((item, index) => ({ item, index }));

  // Sort with index as tie-breaker
  indexed.sort((a, b) => {
    const keyA = keyFn(a.item);
    const keyB = keyFn(b.item);

    const compareResult = compareKeys(keyA, keyB);
    if (compareResult !== 0) {
      return compareResult;
    }

    // Stable sort: maintain original order for equal elements
    return a.index - b.index;
  });

  return indexed.map(({ item }) => item);
}

/**
 * Compares sort keys (supports tuples for multi-level sorting)
 */
function compareKeys(
  a: string | number | readonly (string | number)[],
  b: string | number | readonly (string | number)[]
): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const ai = a[i] ?? '';
      const bi = b[i] ?? '';
      const result = comparePrimitive(ai, bi);
      if (result !== 0) return result;
    }
    return 0;
  }

  return comparePrimitive(a as string | number, b as string | number);
}

/**
 * Compares primitive values
 */
function comparePrimitive(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

/**
 * Checks if text matches a sentence boundary pattern
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at a sentence boundary
 */
export function matchesSentenceBoundary(text: string, position: number): boolean {
  const char = text[position];
  if (!char) return false;
  return /[.!?]/.test(char) && (position + 1 >= text.length || /\s/.test(text[position + 1] ?? ''));
}

/**
 * Checks if text matches an action verb pattern
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at an action verb
 */
export function matchesActionVerb(text: string, position: number): boolean {
  const actionVerbs = [
    'reduce', 'increase', 'optimize', 'deploy', 'implement',
    'improve', 'automate', 'streamline', 'enhance', 'develop',
    'create', 'build', 'establish', 'launch', 'scale',
    'transform', 'migrate', 'integrate', 'consolidate', 'modernize',
    'validate', 'verify', 'analyze', 'monitor', 'coordinate',
    'report', 'track', 'measure', 'assess', 'evaluate',
  ];

  const wordEnd = findWordEnd(text, position);
  const word = text.slice(position, wordEnd).toLowerCase();

  return actionVerbs.includes(word);
}

/**
 * Checks if text matches a quantifier pattern
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at a quantifier
 */
export function matchesQuantifier(text: string, position: number): boolean {
  const remaining = text.slice(position);
  return /^(\d+%|\d+\s*(percent|agents?|users?|teams?|days?|weeks?|months?|hours?))/i.test(remaining);
}

/**
 * Checks if text matches a temporal expression
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at a temporal expression
 */
export function matchesTemporalExpression(text: string, position: number): boolean {
  const temporalPatterns = [
    /^(Q[1-4])/i,
    /^(by|before|after|within|during)/i,
    /^(daily|weekly|monthly|quarterly|annually)/i,
    /^(\d{4}-\d{2}-\d{2})/,
    /^(next|this|last)\s+(week|month|quarter|year)/i,
  ];

  const remaining = text.slice(position);
  return temporalPatterns.some(pattern => pattern.test(remaining));
}

/**
 * Checks if text matches an entity reference
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at an entity reference
 */
export function matchesEntityReference(text: string, position: number): boolean {
  // Check for capitalized words (potential entity names)
  const char = text[position];
  if (!char) return false;

  if (!/[A-Z]/.test(char)) return false;

  // Skip if it's the start of a sentence
  if (position === 0) return false;
  const prevChar = text[position - 1];
  if (prevChar && /[.!?\n]/.test(prevChar)) return false;

  return true;
}

/**
 * Checks if text matches a clause marker
 * @param text - Text to check
 * @param position - Position in text
 * @returns True if position is at a clause marker
 */
export function matchesClauseMarker(text: string, position: number): boolean {
  const clauseMarkers = ['while', 'when', 'if', 'unless', 'although', 'because', 'since', 'after', 'before'];
  const wordEnd = findWordEnd(text, position);
  const word = text.slice(position, wordEnd).toLowerCase();
  return clauseMarkers.includes(word);
}

/**
 * Finds the end position of a word
 */
function findWordEnd(text: string, position: number): number {
  let end = position;
  while (end < text.length && /\w/.test(text[end] ?? '')) {
    end++;
  }
  return end;
}

/**
 * Extracts the next word from text
 * @param text - Text to extract from
 * @param position - Starting position
 * @returns Extracted word
 */
export function extractNextWord(text: string, position: number): string {
  const end = findWordEnd(text, position);
  return text.slice(position, end);
}

/**
 * Advances position past the current word
 * @param text - Text being processed
 * @param position - Current position
 * @returns New position after word
 */
export function advancePastWord(text: string, position: number): number {
  let pos = findWordEnd(text, position);
  // Skip trailing whitespace
  while (pos < text.length && /\s/.test(text[pos] ?? '')) {
    pos++;
  }
  return pos;
}

/**
 * Trims whitespace from both ends of a string
 * @param text - Text to trim
 * @returns Trimmed text
 */
export function trim(text: string): string {
  return text.trim();
}

/**
 * Collapses multiple whitespace characters to single space
 * @param text - Text to process
 * @returns Text with collapsed whitespace
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}
