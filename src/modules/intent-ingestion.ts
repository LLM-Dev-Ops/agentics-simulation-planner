/**
 * Stage 1: Intent Ingestion Module
 * Parses natural language organizational goals into structured intent representation.
 * Deterministic processing with full traceability to ruvvector.
 */

import type {
  UUID,
  Token,
  TokenType,
  StructuredIntent,
  IntentComponents,
  ParsedObjective,
  OrganizationalReference,
  TemporalConstraint,
  QuantitativeRequirement,
  ObjectiveConstraint,
  OrganizationalContext,
  EntityType,
  Priority,
  RuvvectorAdapter,
  AuditEntry,
} from '../types/index.js';
import { ValidationError } from '../types/errors.js';
import { hashSHA256, generateDeterministicId } from '../utils/crypto.js';
import {
  normalizeText,
  getCurrentTimestampUTC,
  matchesSentenceBoundary,
  matchesActionVerb,
  matchesQuantifier,
  matchesTemporalExpression,
  matchesEntityReference,
  matchesClauseMarker,
  MAX_INTENT_LENGTH,
} from '../utils/text.js';

/** Input for intent ingestion */
export interface IntentIngestionInput {
  readonly rawIntent: string;
  readonly organizationalContext: OrganizationalContext;
  readonly sessionId: UUID;
}

/**
 * Validates the raw intent input
 */
function validateInput(input: IntentIngestionInput): void {
  if (!input.rawIntent || typeof input.rawIntent !== 'string') {
    throw new ValidationError({
      code: 'INVALID_INPUT',
      message: 'Raw intent must be a non-empty string',
      severity: 'FATAL',
    });
  }

  if (input.rawIntent.length > MAX_INTENT_LENGTH) {
    throw new ValidationError({
      code: 'INPUT_TOO_LONG',
      message: `Intent exceeds maximum length of ${MAX_INTENT_LENGTH} characters`,
      severity: 'FATAL',
    });
  }

  if (!input.organizationalContext) {
    throw new ValidationError({
      code: 'MISSING_CONTEXT',
      message: 'Organizational context is required',
      severity: 'FATAL',
    });
  }

  if (!input.organizationalContext.organizationId) {
    throw new ValidationError({
      code: 'MISSING_ORG_ID',
      message: 'Organization ID is required in context',
      severity: 'FATAL',
    });
  }
}

/**
 * Tokenizes normalized text into semantic units
 */
function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < text.length) {
    // Skip whitespace
    if (/\s/.test(text[position] ?? '')) {
      position++;
      continue;
    }

    let tokenAdded = false;

    // Check for sentence boundaries
    if (matchesSentenceBoundary(text, position)) {
      tokens.push({ type: 'SENTENCE_BOUNDARY' as TokenType, position });
      position++;
      tokenAdded = true;
    }
    // Check for clause markers
    else if (matchesClauseMarker(text, position)) {
      const wordEnd = findWordEnd(text, position);
      tokens.push({
        type: 'CLAUSE' as TokenType,
        value: text.slice(position, wordEnd),
        position,
      });
      position = wordEnd;
      tokenAdded = true;
    }
    // Check for temporal expressions
    else if (matchesTemporalExpression(text, position)) {
      const temporal = extractTemporalExpression(text, position);
      tokens.push({
        type: 'TEMPORAL' as TokenType,
        value: temporal.value,
        position,
      });
      position += temporal.length;
      tokenAdded = true;
    }
    // Check for quantifiers
    else if (matchesQuantifier(text, position)) {
      const quantifier = extractQuantifier(text, position);
      tokens.push({
        type: 'QUANTIFIER' as TokenType,
        value: quantifier.value,
        position,
      });
      position += quantifier.length;
      tokenAdded = true;
    }
    // Check for action verbs
    else if (matchesActionVerb(text, position)) {
      const wordEnd = findWordEnd(text, position);
      tokens.push({
        type: 'ACTION' as TokenType,
        value: text.slice(position, wordEnd).toLowerCase(),
        position,
      });
      position = wordEnd;
      tokenAdded = true;
    }
    // Check for entity references (capitalized words)
    else if (matchesEntityReference(text, position)) {
      const entity = extractEntityReference(text, position);
      tokens.push({
        type: 'ENTITY' as TokenType,
        value: entity.value,
        position,
      });
      position += entity.length;
      tokenAdded = true;
    }

    // Default: regular word
    if (!tokenAdded) {
      const wordEnd = findWordEnd(text, position);
      if (wordEnd > position) {
        tokens.push({
          type: 'WORD' as TokenType,
          value: text.slice(position, wordEnd),
          position,
        });
        position = wordEnd;
      } else {
        position++;
      }
    }
  }

  return tokens;
}

/**
 * Finds the end position of a word
 */
function findWordEnd(text: string, position: number): number {
  let end = position;
  while (end < text.length && /\S/.test(text[end] ?? '')) {
    end++;
  }
  return end;
}

/**
 * Extracts a temporal expression from text
 */
function extractTemporalExpression(
  text: string,
  position: number
): { value: string; length: number } {
  const patterns = [
    /^Q[1-4]\s*\d{4}/i,
    /^Q[1-4]/i,
    /^by\s+\w+/i,
    /^within\s+\d+\s+\w+/i,
    /^\d{4}-\d{2}-\d{2}/,
    /^(next|this|last)\s+(week|month|quarter|year)/i,
    /^(daily|weekly|monthly|quarterly|annually)/i,
  ];

  const remaining = text.slice(position);
  for (const pattern of patterns) {
    const match = remaining.match(pattern);
    if (match) {
      return { value: match[0], length: match[0].length };
    }
  }

  return { value: '', length: 0 };
}

/**
 * Extracts a quantifier from text
 */
function extractQuantifier(
  text: string,
  position: number
): { value: string; length: number } {
  const patterns = [
    /^\d+%/,
    /^\d+\s*(percent|agents?|users?|teams?|days?|weeks?|months?|hours?)/i,
    /^\$[\d,]+/,
    /^\d+[KkMmBb]?/,
  ];

  const remaining = text.slice(position);
  for (const pattern of patterns) {
    const match = remaining.match(pattern);
    if (match) {
      return { value: match[0], length: match[0].length };
    }
  }

  return { value: '', length: 0 };
}

/**
 * Extracts an entity reference from text
 */
function extractEntityReference(
  text: string,
  position: number
): { value: string; length: number } {
  // Match capitalized word sequences (potential entity names)
  const match = text.slice(position).match(/^[A-Z][a-zA-Z]*(\s+[A-Z][a-zA-Z]*)*/);
  if (match) {
    return { value: match[0], length: match[0].length };
  }
  return { value: '', length: 0 };
}

/**
 * Extracts intent components from tokens
 */
function extractComponents(
  tokens: readonly Token[],
  normalizedInput: string,
  context: OrganizationalContext
): IntentComponents {
  const objectives: ParsedObjective[] = [];
  const organizationalReferences: OrganizationalReference[] = [];
  const temporalConstraints: TemporalConstraint[] = [];
  const quantitativeRequirements: QuantitativeRequirement[] = [];

  // Group tokens by sentence/clause
  let currentAction: string | null = null;
  let currentTargets: string[] = [];
  let currentModifiers: string[] = [];
  let currentConstraints: ObjectiveConstraint[] = [];
  let objectivePosition = 0;

  for (const token of tokens) {
    switch (token.type) {
      case 'ACTION':
        // Save previous objective if exists
        if (currentAction) {
          objectives.push({
            action: currentAction,
            targets: currentTargets,
            modifiers: currentModifiers,
            constraints: currentConstraints,
            position: objectivePosition,
          });
        }
        currentAction = token.value ?? '';
        currentTargets = [];
        currentModifiers = [];
        currentConstraints = [];
        objectivePosition = token.position;
        break;

      case 'ENTITY':
        if (currentAction) {
          currentTargets.push(token.value ?? '');
        }
        // Also track as organizational reference
        if (token.value) {
          const entityType = classifyEntity(token.value, context);
          organizationalReferences.push({
            name: token.value,
            type: entityType,
            context: normalizedInput.slice(
              Math.max(0, token.position - 20),
              Math.min(normalizedInput.length, token.position + token.value.length + 20)
            ),
          });
        }
        break;

      case 'TEMPORAL':
        if (token.value) {
          temporalConstraints.push({
            expression: token.value,
            normalized: normalizeTemporalExpression(token.value),
            scopeStart: objectivePosition,
            scopeEnd: token.position + token.value.length,
          });
          if (currentAction) {
            currentConstraints.push({
              type: 'TEMPORAL',
              specification: token.value,
              priority: 'HIGH',
            });
          }
        }
        break;

      case 'QUANTIFIER':
        if (token.value) {
          const parsed = parseQuantifier(token.value);
          if (parsed) {
            quantitativeRequirements.push(parsed);
          }
          if (currentAction) {
            currentModifiers.push(token.value);
          }
        }
        break;

      case 'CLAUSE':
        // Clause markers indicate conditional or complex objectives
        if (currentAction) {
          currentModifiers.push(token.value ?? '');
        }
        break;

      case 'WORD':
        if (currentAction) {
          currentModifiers.push(token.value ?? '');
        }
        break;

      case 'SENTENCE_BOUNDARY':
        // End of sentence, save current objective
        if (currentAction) {
          objectives.push({
            action: currentAction,
            targets: currentTargets,
            modifiers: currentModifiers,
            constraints: currentConstraints,
            position: objectivePosition,
          });
          currentAction = null;
          currentTargets = [];
          currentModifiers = [];
          currentConstraints = [];
        }
        break;
    }
  }

  // Don't forget the last objective
  if (currentAction) {
    objectives.push({
      action: currentAction,
      targets: currentTargets,
      modifiers: currentModifiers,
      constraints: currentConstraints,
      position: objectivePosition,
    });
  }

  return {
    objectives,
    organizationalReferences,
    temporalConstraints,
    quantitativeRequirements,
  };
}

/**
 * Classifies an entity into a type based on context
 */
function classifyEntity(name: string, context: OrganizationalContext): EntityType {
  const nameLower = name.toLowerCase();

  // Check against known divisions
  for (const division of context.topology.divisions) {
    if (division.name.toLowerCase().includes(nameLower)) {
      return 'DIVISION';
    }
  }

  // Check against known teams
  for (const team of context.topology.teams) {
    if (team.name.toLowerCase().includes(nameLower)) {
      return 'TEAM';
    }
  }

  // Heuristic classification based on common patterns
  if (/region|country|area|zone/i.test(name)) {
    return 'REGION';
  }
  if (/system|platform|service|api/i.test(name)) {
    return 'SYSTEM';
  }
  if (/process|workflow|procedure/i.test(name)) {
    return 'PROCESS';
  }
  if (/manager|director|engineer|analyst/i.test(name)) {
    return 'ROLE';
  }

  return 'DIVISION'; // Default
}

/**
 * Normalizes a temporal expression
 */
function normalizeTemporalExpression(expression: string): string {
  // Convert Q1-Q4 to date ranges
  const quarterMatch = expression.match(/Q([1-4])(?:\s*(\d{4}))?/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1] ?? '1', 10);
    const year = quarterMatch[2] ?? new Date().getFullYear().toString();
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    return `${year}-${String(startMonth).padStart(2, '0')}-01/${year}-${String(endMonth).padStart(2, '0')}-30`;
  }

  return expression.toLowerCase();
}

/**
 * Parses a quantifier into structured requirement
 */
function parseQuantifier(value: string): QuantitativeRequirement | null {
  // Percentage
  const percentMatch = value.match(/^(\d+)%$/);
  if (percentMatch) {
    return {
      value: parseInt(percentMatch[1] ?? '0', 10),
      unit: 'percent',
      target: 'reduction',
    };
  }

  // Count with unit
  const countMatch = value.match(/^(\d+)\s*(agents?|users?|teams?|days?|weeks?|months?|hours?)/i);
  if (countMatch) {
    return {
      value: parseInt(countMatch[1] ?? '0', 10),
      unit: countMatch[2]?.toLowerCase().replace(/s$/, '') ?? 'unit',
      target: 'count',
    };
  }

  // Currency
  const currencyMatch = value.match(/^\$?([\d,]+)[KkMmBb]?/);
  if (currencyMatch) {
    let numValue = parseInt(currencyMatch[1]?.replace(/,/g, '') ?? '0', 10);
    if (/[Kk]/.test(value)) numValue *= 1000;
    if (/[Mm]/.test(value)) numValue *= 1000000;
    if (/[Bb]/.test(value)) numValue *= 1000000000;
    return {
      value: numValue,
      unit: 'currency',
      target: 'budget',
    };
  }

  return null;
}

/**
 * Ingests natural language intent into structured representation
 */
export async function ingestIntent(
  input: IntentIngestionInput,
  adapter: RuvvectorAdapter
): Promise<StructuredIntent> {
  const startTime = getCurrentTimestampUTC();

  // Validate input
  validateInput(input);

  // Normalize text
  const normalizedInput = normalizeText(input.rawIntent);

  // Compute input hash for determinism verification
  const inputHash = hashSHA256(normalizedInput);

  // Tokenize
  const tokens = tokenize(normalizedInput);

  // Extract components
  const components = extractComponents(tokens, normalizedInput, input.organizationalContext);

  // Validate extracted objectives
  if (components.objectives.length === 0) {
    throw new ValidationError({
      code: 'NO_OBJECTIVES',
      message: 'No actionable objectives found in intent',
      severity: 'FATAL',
    });
  }

  // Generate deterministic ID
  const intentId = generateDeterministicId(
    'intent',
    input.sessionId,
    inputHash
  );

  // Create structured intent
  const structuredIntent: StructuredIntent = {
    id: intentId,
    rawInput: input.rawIntent,
    normalizedInput,
    tokens,
    components,
    context: input.organizationalContext,
    sessionId: input.sessionId,
    timestamp: startTime,
    inputHash,
  };

  // Store in ruvvector
  await adapter.store(
    `intent:${intentId}`,
    structuredIntent,
    { stage: 'INTENT_INGESTION', type: 'structured_intent' }
  );

  // Append audit entry
  const auditEntry: AuditEntry = {
    stage: 'INTENT_INGESTION',
    operation: 'INGEST',
    inputHash,
    outputId: intentId,
    timestamp: getCurrentTimestampUTC(),
    decision: 'SUCCESS',
    metrics: {
      tokenCount: tokens.length,
      objectiveCount: components.objectives.length,
      entityCount: components.organizationalReferences.length,
    },
  };
  await adapter.appendAudit(input.sessionId, auditEntry);

  return structuredIntent;
}
