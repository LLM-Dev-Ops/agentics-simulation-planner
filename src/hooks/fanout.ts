/**
 * Post-execution fanout hooks for core bundles.
 *
 * After a successful simulation plan, fires non-blocking POST calls to:
 *   - intelligence-core  /v1/ingest/telemetry
 *   - security-core      /v1/scan
 *   - data-core          /v1/lineage/record
 *
 * Fanout is fire-and-forget: failures are logged at WARN, never ERROR,
 * and never block the simulation response.
 */

import { hashSHA256, serializeCanonical } from '../utils/crypto.js';
import type { ExecutionProof } from '../contracts/types.js';

// ---------------------------------------------------------------------------
// Service URL configuration (env-overridable, Cloud Run defaults)
// ---------------------------------------------------------------------------

const SERVICE_URLS = {
  intelligenceCore:
    process.env['INTELLIGENCE_CORE_URL'] ??
    'https://intelligence-core-1062287243982.us-central1.run.app',
  securityCore:
    process.env['SECURITY_CORE_URL'] ??
    'https://security-core-1062287243982.us-central1.run.app',
  dataCore:
    process.env['DATA_CORE_URL'] ??
    'https://data-core-1062287243982.us-central1.run.app',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FanoutContext {
  /** Execution ID (sessionId from the planning result) */
  executionId: string;
  /** Correlation ID forwarded from the inbound request */
  correlationId: string;
  /** Planning processing time in ms */
  timingMs: number;
  /** Number of execution proof stages recorded */
  layersExecuted: number;
  /** SHA-256 hash of the execution proof */
  proofHash: string;
  /** The validated scenario object (if any) */
  scenario?: unknown;
  /** Result artifacts for security scanning */
  artifacts?: unknown;
  /** Parent span ID for lineage (defaults to correlationId) */
  parentSpanId?: string;
  /** Hash of the planning input */
  inputHash: string;
  /** Hash of the planning output */
  outputHash: string;
}

interface FanoutResult {
  target: string;
  status: number | null;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Individual POST helpers
// ---------------------------------------------------------------------------

async function postJSON(
  url: string,
  body: Record<string, unknown>,
  correlationId: string,
  signal: AbortSignal,
): Promise<{ status: number }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify(body),
    signal,
  });
  return { status: res.status };
}

async function fanoutWithTiming(
  targetName: string,
  url: string,
  body: Record<string, unknown>,
  correlationId: string,
): Promise<FanoutResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const { status } = await postJSON(url, body, correlationId, controller.signal);
    const durationMs = Date.now() - start;
    console.log(`Fanout to ${targetName}: ${status} (${durationMs}ms)`);
    return { target: targetName, status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Fanout to ${targetName}: FAILED (${durationMs}ms) - ${message}`);
    return { target: targetName, status: null, durationMs, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire non-blocking POST calls to all core bundles.
 *
 * Returns a promise that settles when all calls complete (or time out),
 * but callers should NOT await this — it is designed to run detached.
 */
export function fireFanout(ctx: FanoutContext): Promise<FanoutResult[]> {
  const now = new Date().toISOString();

  const intelligenceBody = {
    source: 'agentics-simulation',
    event: 'simulation_complete',
    execution_id: ctx.executionId,
    timing: ctx.timingMs,
    layers_executed: ctx.layersExecuted,
    proof_hash: ctx.proofHash,
    timestamp: now,
  };

  const securityBody = {
    source: 'agentics-simulation',
    execution_id: ctx.executionId,
    scenario: ctx.scenario ?? null,
    artifacts: ctx.artifacts ?? null,
    timestamp: now,
  };

  const lineageBody = {
    source: 'agentics-simulation',
    execution_id: ctx.executionId,
    parent_span_id: ctx.parentSpanId ?? ctx.correlationId,
    layers_executed: ctx.layersExecuted,
    input_hash: ctx.inputHash,
    output_hash: ctx.outputHash,
    timestamp: now,
  };

  const tasks = [
    fanoutWithTiming(
      'intelligence-core',
      `${SERVICE_URLS.intelligenceCore}/v1/ingest/telemetry`,
      intelligenceBody,
      ctx.correlationId,
    ),
    fanoutWithTiming(
      'security-core',
      `${SERVICE_URLS.securityCore}/v1/scan`,
      securityBody,
      ctx.correlationId,
    ),
    fanoutWithTiming(
      'data-core',
      `${SERVICE_URLS.dataCore}/v1/lineage/record`,
      lineageBody,
      ctx.correlationId,
    ),
  ];

  return Promise.allSettled(tasks).then((results) =>
    results.map((r) => (r.status === 'fulfilled' ? r.value : {
      target: 'unknown',
      status: null,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    })),
  );
}

/**
 * Build a FanoutContext from planning results and request metadata.
 */
export function buildFanoutContext(opts: {
  sessionId: string;
  correlationId: string;
  processingTimeMs: number;
  executionProof: ExecutionProof | { entries: readonly unknown[]; responseHash?: string };
  scenario?: unknown;
  plan?: unknown;
  rawBody?: unknown;
}): FanoutContext {
  const proofHash = hashSHA256(serializeCanonical(opts.executionProof));
  const inputHash = hashSHA256(serializeCanonical(opts.rawBody ?? {}));
  const outputHash = opts.executionProof.responseHash
    ?? hashSHA256(serializeCanonical(opts.plan ?? {}));

  return {
    executionId: opts.sessionId,
    correlationId: opts.correlationId,
    timingMs: opts.processingTimeMs,
    layersExecuted: opts.executionProof.entries.length,
    proofHash,
    scenario: opts.scenario,
    artifacts: opts.plan,
    parentSpanId: opts.correlationId,
    inputHash,
    outputHash,
  };
}
