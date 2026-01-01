/**
 * Unit tests for text utilities
 */

import {
  normalizeText,
  getCurrentTimestampUTC,
  stableSort,
  matchesSentenceBoundary,
  matchesActionVerb,
  matchesQuantifier,
  matchesTemporalExpression,
  matchesEntityReference,
  matchesClauseMarker,
  extractNextWord,
  advancePastWord,
  trim,
  collapseWhitespace,
  MAX_INTENT_LENGTH,
} from '../../src/utils/text.js';

describe('Text Utilities', () => {
  describe('normalizeText', () => {
    it('should trim whitespace', () => {
      expect(normalizeText('  hello world  ')).toBe('hello world');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeText('hello    world')).toBe('hello world');
    });

    it('should remove control characters', () => {
      expect(normalizeText('hello\x00world')).toBe('helloworld');
    });

    it('should preserve newlines collapsed to space', () => {
      const result = normalizeText('hello\nworld');
      expect(result).toBe('hello\nworld');
    });

    it('should handle unicode normalization', () => {
      // Combining diacritical mark
      const input = 'cafe\u0301';
      const result = normalizeText(input);
      expect(result.normalize('NFC')).toBe(result);
    });

    it('should handle empty string', () => {
      expect(normalizeText('')).toBe('');
    });

    it('should handle string with only whitespace', () => {
      expect(normalizeText('   ')).toBe('');
    });
  });

  describe('getCurrentTimestampUTC', () => {
    it('should return ISO 8601 format', () => {
      const timestamp = getCurrentTimestampUTC();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should return UTC timezone', () => {
      const timestamp = getCurrentTimestampUTC();
      expect(timestamp.endsWith('Z')).toBe(true);
    });
  });

  describe('stableSort', () => {
    it('should sort by key', () => {
      const items = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
      const sorted = stableSort(items, item => item.name);
      expect(sorted.map(i => i.name)).toEqual(['a', 'b', 'c']);
    });

    it('should maintain stability for equal elements', () => {
      const items = [
        { name: 'a', order: 1 },
        { name: 'a', order: 2 },
        { name: 'a', order: 3 },
      ];
      const sorted = stableSort(items, item => item.name);
      expect(sorted.map(i => i.order)).toEqual([1, 2, 3]);
    });

    it('should not mutate original array', () => {
      const items = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
      stableSort(items, item => item.name);
      expect(items.map(i => i.name)).toEqual(['c', 'a', 'b']);
    });

    it('should handle numeric keys', () => {
      const items = [{ value: 3 }, { value: 1 }, { value: 2 }];
      const sorted = stableSort(items, item => item.value);
      expect(sorted.map(i => i.value)).toEqual([1, 2, 3]);
    });

    it('should handle tuple keys for multi-level sorting', () => {
      const items = [
        { a: 1, b: 2 },
        { a: 1, b: 1 },
        { a: 2, b: 1 },
      ];
      const sorted = stableSort(items, item => [item.a, item.b]);
      expect(sorted).toEqual([
        { a: 1, b: 1 },
        { a: 1, b: 2 },
        { a: 2, b: 1 },
      ]);
    });
  });

  describe('matchesSentenceBoundary', () => {
    it('should match period followed by space', () => {
      expect(matchesSentenceBoundary('Hello. World', 5)).toBe(true);
    });

    it('should match period at end', () => {
      expect(matchesSentenceBoundary('Hello.', 5)).toBe(true);
    });

    it('should match exclamation mark', () => {
      expect(matchesSentenceBoundary('Hello! World', 5)).toBe(true);
    });

    it('should match question mark', () => {
      expect(matchesSentenceBoundary('Hello? World', 5)).toBe(true);
    });

    it('should not match period in abbreviation', () => {
      expect(matchesSentenceBoundary('Dr.Smith', 2)).toBe(false);
    });
  });

  describe('matchesActionVerb', () => {
    it('should match "reduce"', () => {
      expect(matchesActionVerb('reduce costs', 0)).toBe(true);
    });

    it('should match "optimize"', () => {
      expect(matchesActionVerb('optimize performance', 0)).toBe(true);
    });

    it('should match "deploy"', () => {
      expect(matchesActionVerb('deploy agents', 0)).toBe(true);
    });

    it('should not match non-action verbs', () => {
      expect(matchesActionVerb('have fun', 0)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(matchesActionVerb('Reduce costs', 0)).toBe(true);
    });
  });

  describe('matchesQuantifier', () => {
    it('should match percentage', () => {
      expect(matchesQuantifier('15% reduction', 0)).toBe(true);
    });

    it('should match count with unit', () => {
      expect(matchesQuantifier('500 agents', 0)).toBe(true);
    });

    it('should match "percent" spelled out', () => {
      expect(matchesQuantifier('20 percent', 0)).toBe(true);
    });

    it('should not match plain numbers', () => {
      expect(matchesQuantifier('abc 123', 0)).toBe(false);
    });
  });

  describe('matchesTemporalExpression', () => {
    it('should match Q1-Q4', () => {
      expect(matchesTemporalExpression('Q3 2024', 0)).toBe(true);
    });

    it('should match "by"', () => {
      expect(matchesTemporalExpression('by December', 0)).toBe(true);
    });

    it('should match ISO date', () => {
      expect(matchesTemporalExpression('2024-12-31', 0)).toBe(true);
    });

    it('should match "next week"', () => {
      expect(matchesTemporalExpression('next month', 0)).toBe(true);
    });

    it('should not match regular words', () => {
      expect(matchesTemporalExpression('hello world', 0)).toBe(false);
    });
  });

  describe('matchesEntityReference', () => {
    it('should match capitalized word', () => {
      expect(matchesEntityReference('the Sales team', 4)).toBe(true);
    });

    it('should not match lowercase word', () => {
      expect(matchesEntityReference('the sales team', 4)).toBe(false);
    });

    it('should not match sentence start', () => {
      expect(matchesEntityReference('Sales team', 0)).toBe(false);
    });
  });

  describe('matchesClauseMarker', () => {
    it('should match "while"', () => {
      expect(matchesClauseMarker('while maintaining', 0)).toBe(true);
    });

    it('should match "if"', () => {
      expect(matchesClauseMarker('if possible', 0)).toBe(true);
    });

    it('should not match regular words', () => {
      expect(matchesClauseMarker('hello world', 0)).toBe(false);
    });
  });

  describe('extractNextWord', () => {
    it('should extract word at position', () => {
      expect(extractNextWord('hello world', 0)).toBe('hello');
    });

    it('should extract word from middle', () => {
      expect(extractNextWord('hello world', 6)).toBe('world');
    });
  });

  describe('advancePastWord', () => {
    it('should advance past word and whitespace', () => {
      expect(advancePastWord('hello world', 0)).toBe(6);
    });
  });

  describe('trim', () => {
    it('should trim whitespace', () => {
      expect(trim('  hello  ')).toBe('hello');
    });
  });

  describe('collapseWhitespace', () => {
    it('should collapse multiple spaces', () => {
      expect(collapseWhitespace('hello   world')).toBe('hello world');
    });
  });

  describe('MAX_INTENT_LENGTH', () => {
    it('should be defined', () => {
      expect(MAX_INTENT_LENGTH).toBe(100000);
    });
  });
});
