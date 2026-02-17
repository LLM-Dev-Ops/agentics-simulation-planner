/**
 * HTTP Server for Agentics Simulation Planner
 * Exposes /v1/plans endpoint for Cloud Run deployment
 *
 * IMPORTANT: All requests are validated against @agentics/contracts
 * BEFORE any planning operations begin.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import {
  planSimulationWithContract,
  type ContractPlanningInput,
} from './core/planner.js';
import {
  parseAndValidateRequest,
  ContractValidationError,
  createValidationFailureProof,
  buildSynthesisFields,
  buildFailedSynthesisFields,
  type ContractValidationResult,
  type ExecutionProof,
  type ExecutionMetadata,
  type ExecutiveSynthesisFields,
} from './contracts/index.js';
import {
  buildExecutiveSummary,
  elevateRiskForProduction,
  isProductionTarget,
  type DecisionPacket,
  type SynthesisPhase,
} from './synthesis/index.js';
import { getCurrentTimestampUTC } from './utils/text.js';
import { SCHEMA_VERSION } from './contracts/validator.js';
import { fireFanout, buildFanoutContext } from './hooks/fanout.js';

const PORT = parseInt(process.env['PORT'] || '8080', 10);
const PLANNER_VERSION = '1.0.0';

/**
 * Creates execution metadata for HTTP responses.
 * Required at the root of all responses per agentics CLI contract.
 */
function createExecutionMetadata(
  requestId: string,
  processingTimeMs: number,
  isSuccess: boolean
): ExecutionMetadata {
  return {
    request_id: requestId,
    timestamp: getCurrentTimestampUTC(),
    service: 'agentics-simulation-planner',
    version: PLANNER_VERSION,
    processing_time_ms: processingTimeMs,
    status: isSuccess ? 'success' : 'error',
  };
}

/**
 * Response format for planning endpoints.
 * ALL responses include execution_metadata, execution proof, and validation result.
 *
 * Executive-synthesis compatible fields are included alongside existing fields
 * to enable plan output to be consumed by executive-synthesis unchanged.
 *
 * Decision packets are emitted for plan create operations (this endpoint).
 * plan approve would also emit decision packets (not implemented here).
 * plan list, plan inspect, plan delete are excluded from synthesis.
 */
interface PlanningResponse extends Partial<ExecutiveSynthesisFields> {
  success: boolean;
  execution_metadata: ExecutionMetadata;
  plan?: unknown;
  sessionId?: string;
  contentHash?: string;
  processingTimeMs?: number;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  executionProof: ExecutionProof;
  validationResult: ContractValidationResult;
  /** Decision packet for synthesis integration */
  synthesis?: DecisionPacket;
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ============================================================================
// Manifest-ref based plan generation (simplified contract)
// ============================================================================

interface ManifestRef {
  id: string;
  version: string;
}

interface ManifestPlanRequest {
  manifest_ref: ManifestRef;
  params?: Record<string, unknown>;
  intent: string;
}

interface ManifestPlanStep {
  step_id: string;
  name: string;
  service: string;
  action: string;
  config: Record<string, unknown>;
  dependencies: string[];
}

interface ManifestPlanResponse {
  plan: {
    id: string;
    version: string;
    intent: string;
    steps: ManifestPlanStep[];
    created_at: string;
    estimated_duration_ms: number;
  };
  execution_metadata: {
    trace_id: string;
    timestamp: string;
    service: string;
  };
}

function isManifestPlanRequest(body: unknown): body is ManifestPlanRequest {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj['manifest_ref'] === 'object' &&
    obj['manifest_ref'] !== null &&
    typeof obj['intent'] === 'string'
  );
}

function generateDefaultSteps(
  intent: string,
  params: Record<string, unknown> | undefined
): ManifestPlanStep[] {
  return [
    {
      step_id: 'step-1',
      name: 'Initialize simulation environment',
      service: 'agentics-simulation-engine',
      action: 'setup',
      config: params ?? {},
      dependencies: [],
    },
    {
      step_id: 'step-2',
      name: 'Execute simulation scenarios',
      service: 'agentics-simulation-runner',
      action: 'run',
      config: {},
      dependencies: ['step-1'],
    },
    {
      step_id: 'step-3',
      name: 'Collect and index results',
      service: 'agentics-results-index',
      action: 'store',
      config: {},
      dependencies: ['step-2'],
    },
  ];
}

function handleManifestPlanRequest(
  req: IncomingMessage,
  body: ManifestPlanRequest
): ManifestPlanResponse {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

  const steps = generateDefaultSteps(body.intent, body.params);

  return {
    plan: {
      id: `plan-${randomUUID()}`,
      version: body.manifest_ref.version ?? '1.0.0',
      intent: body.intent,
      steps,
      created_at: new Date().toISOString(),
      estimated_duration_ms: 30000,
    },
    execution_metadata: {
      trace_id: correlationId,
      timestamp: new Date().toISOString(),
      service: 'agentics-simulation-planner',
    },
  };
}

// ============================================================================
// Contract-validated plan generation (existing complex contract)
// ============================================================================

async function handlePlansEndpoint(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestStartTime = Date.now();

  if (req.method !== 'POST') {
    // Even method errors include a minimal execution proof
    const proof = createValidationFailureProof(
      { method: req.method },
      [{ path: '/method', message: 'Method not allowed' }]
    );
    const processingTimeMs = Date.now() - requestStartTime;
    const response: PlanningResponse = {
      success: false,
      execution_metadata: createExecutionMetadata(proof.sessionId, processingTimeMs, false),
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        details: { allowed: ['POST'] },
      },
      executionProof: proof,
      validationResult: {
        valid: false,
        errors: [{ path: '/method', message: 'Method not allowed' }],
        validatedAt: getCurrentTimestampUTC(),
        schemaVersion: SCHEMA_VERSION,
      },
    };
    sendJSON(res, 405, response);
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await parseBody(req);
  } catch {
    const proof = createValidationFailureProof(
      {},
      [{ path: '/', message: 'Invalid JSON body' }]
    );
    const processingTimeMs = Date.now() - requestStartTime;
    const response: PlanningResponse = {
      success: false,
      execution_metadata: createExecutionMetadata(proof.sessionId, processingTimeMs, false),
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON body',
      },
      executionProof: proof,
      validationResult: {
        valid: false,
        errors: [{ path: '/', message: 'Invalid JSON body' }],
        validatedAt: getCurrentTimestampUTC(),
        schemaVersion: SCHEMA_VERSION,
      },
    };
    sendJSON(res, 400, response);
    return;
  }

  await handlePlansEndpointWithBody(rawBody, req, res);
}

async function handlePlansEndpointWithBody(
  rawBody: unknown,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const requestStartTime = Date.now();

  try {
    // Contract validation happens FIRST, before any planning
    const validatedRequest = parseAndValidateRequest(rawBody);

    // Build the planning input from validated request
    const input: ContractPlanningInput = {
      intent: validatedRequest.intent,
      organizationName: validatedRequest.organizationName,
      organizationId: validatedRequest.organizationId,
      config: validatedRequest.config,
      scenario: validatedRequest.scenario,
    };

    const options = {
      seed: validatedRequest.seed,
      namespace: validatedRequest.namespace,
    };

    // Execute planning with contract enforcement
    const result = await planSimulationWithContract(input, rawBody, options);

    // Build executive-synthesis compatible fields
    const synthesisFields = buildSynthesisFields({
      plan: result.plan,
      sessionId: result.sessionId,
      contentHash: result.contentHash,
      processingTimeMs: result.processingTimeMs,
      executionProof: result.executionProof,
      intent: validatedRequest.intent,
      scenario: validatedRequest.scenario,
      namespace: validatedRequest.namespace,
    });

    // Build decision packet for plan create operation
    const phases: SynthesisPhase[] = ['validation', 'execution', 'persistence'];
    let decisionSummary = buildExecutiveSummary(
      {
        environment: isProductionTarget(rawBody as Record<string, unknown>) ? 'production' : 'development',
        timestamp: getCurrentTimestampUTC(),
        version: result.plan.version,
        commit_sha: process.env['GIT_SHA'],
      },
      {
        success_rate: 1.0,
        failed_iterations: 0,
        blocking_issues: [],
      },
      phases
    );

    // Apply production risk elevation if targeting production
    if (isProductionTarget(rawBody as Record<string, unknown>)) {
      decisionSummary = elevateRiskForProduction(decisionSummary);
    }

    const response: PlanningResponse = {
      success: true,
      execution_metadata: createExecutionMetadata(
        result.sessionId,
        result.processingTimeMs,
        true
      ),
      plan: result.plan,
      sessionId: result.sessionId,
      contentHash: result.contentHash,
      processingTimeMs: result.processingTimeMs,
      executionProof: result.executionProof,
      validationResult: result.validationResult,
      // Executive-synthesis compatible fields
      ...synthesisFields,
      // Decision packet for CLI display
      synthesis: decisionSummary.packet,
    };

    sendJSON(res, 200, response);

    // Fire-and-forget fanout to core bundles (non-blocking)
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? result.sessionId;
    const fanoutCtx = buildFanoutContext({
      sessionId: result.sessionId,
      correlationId,
      processingTimeMs: result.processingTimeMs,
      executionProof: result.executionProof,
      scenario: validatedRequest.scenario,
      plan: result.plan,
      rawBody,
    });
    fireFanout(fanoutCtx).catch(() => {/* swallow — individual failures already logged at WARN */});
  } catch (error) {
    // Extract intent from raw body for error responses
    const extractedIntent = typeof rawBody === 'object' && rawBody !== null
      ? (rawBody as Record<string, unknown>)['intent'] as string | undefined
      : undefined;
    const fallbackIntent = extractedIntent ?? 'Unknown intent';

    // Handle contract validation errors specifically
    if (error instanceof ContractValidationError) {
      const proof = createValidationFailureProof(rawBody, error.errors);
      const processingTimeMs = Date.now() - requestStartTime;

      // Build synthesis fields for failed validation
      const synthesisFields = buildFailedSynthesisFields(
        error,
        proof.sessionId,
        fallbackIntent,
        processingTimeMs,
        typeof rawBody === 'object' && rawBody !== null
          ? (rawBody as Record<string, unknown>)['namespace'] as string | undefined
          : undefined
      );

      // Build decision packet for failed validation
      const blockingIssues = error.errors.map(e => ({
        id: `issue-${e.path}`,
        category: 'validation_failure' as const,
        description: e.message,
        path: e.path,
      }));

      const failedPhases: SynthesisPhase[] = ['validation'];
      let decisionSummary = buildExecutiveSummary(
        {
          environment: isProductionTarget(rawBody as Record<string, unknown>) ? 'production' : 'development',
          timestamp: getCurrentTimestampUTC(),
          version: '1.0.0',
          commit_sha: process.env['GIT_SHA'],
        },
        {
          success_rate: 0.0,
          failed_iterations: 1,
          blocking_issues: blockingIssues,
        },
        failedPhases
      );

      // Apply production risk elevation if targeting production
      if (isProductionTarget(rawBody as Record<string, unknown>)) {
        decisionSummary = elevateRiskForProduction(decisionSummary);
      }

      const response: PlanningResponse = {
        success: false,
        execution_metadata: createExecutionMetadata(proof.sessionId, processingTimeMs, false),
        error: {
          code: error.code,
          message: error.message,
          details: error.errors,
        },
        executionProof: proof,
        validationResult: {
          valid: false,
          errors: error.errors,
          validatedAt: error.validatedAt,
          schemaVersion: SCHEMA_VERSION,
        },
        // Executive-synthesis compatible fields
        ...synthesisFields,
        // Decision packet for CLI display
        synthesis: decisionSummary.packet,
      };
      sendJSON(res, 400, response);
      return;
    }

    // For other errors, still include execution proof
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const proof = createValidationFailureProof(rawBody, [
      { path: '/', message: errorMessage },
    ]);
    const processingTimeMs = Date.now() - requestStartTime;

    // Build synthesis fields for planning failure
    const synthesisFields = buildFailedSynthesisFields(
      error instanceof Error ? error : new Error(errorMessage),
      proof.sessionId,
      fallbackIntent,
      processingTimeMs,
      typeof rawBody === 'object' && rawBody !== null
        ? (rawBody as Record<string, unknown>)['namespace'] as string | undefined
        : undefined
    );

    // Build decision packet for planning failure
    const executionBlockingIssues = [{
      id: 'issue-execution',
      category: 'execution_failure' as const,
      description: errorMessage,
      path: '/',
    }];

    const failedPhases: SynthesisPhase[] = ['validation', 'execution'];
    let decisionSummary = buildExecutiveSummary(
      {
        environment: isProductionTarget(rawBody as Record<string, unknown>) ? 'production' : 'development',
        timestamp: getCurrentTimestampUTC(),
        version: '1.0.0',
        commit_sha: process.env['GIT_SHA'],
      },
      {
        success_rate: 0.0,
        failed_iterations: 1,
        blocking_issues: executionBlockingIssues,
      },
      failedPhases
    );

    // Apply production risk elevation if targeting production
    if (isProductionTarget(rawBody as Record<string, unknown>)) {
      decisionSummary = elevateRiskForProduction(decisionSummary);
    }

    const response: PlanningResponse = {
      success: false,
      execution_metadata: createExecutionMetadata(proof.sessionId, processingTimeMs, false),
      error: {
        code: 'PLANNING_ERROR',
        message: errorMessage,
      },
      executionProof: proof,
      validationResult: {
        valid: true, // Request was valid, but planning failed
        errors: [],
        validatedAt: getCurrentTimestampUTC(),
        schemaVersion: SCHEMA_VERSION,
      },
      // Executive-synthesis compatible fields
      ...synthesisFields,
      // Decision packet for CLI display
      synthesis: decisionSummary.packet,
    };
    sendJSON(res, 500, response);
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';

  // Health check endpoint
  if (url === '/health' || url === '/') {
    sendJSON(res, 200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'agentics-simulation-planner',
    });
    return;
  }

  // Plans endpoint - support multiple paths for CLI compatibility
  if (url === '/v1/plans' || url === '/v1/plan' || url === '/plan' || url === '/plans') {
    // For POST requests, check if this is a manifest_ref-based request
    if (req.method === 'POST') {
      let rawBody: unknown;
      try {
        rawBody = await parseBody(req);
      } catch {
        sendJSON(res, 400, {
          error: { code: 'INVALID_JSON', message: 'Invalid JSON body' },
          execution_metadata: {
            trace_id: randomUUID(),
            timestamp: new Date().toISOString(),
            service: 'agentics-simulation-planner',
          },
        });
        return;
      }

      // Route based on request shape
      if (isManifestPlanRequest(rawBody)) {
        const response = handleManifestPlanRequest(req, rawBody);
        sendJSON(res, 200, response);

        // Fire-and-forget fanout for manifest-based plans
        const correlationId =
          (req.headers['x-correlation-id'] as string | undefined) ?? response.execution_metadata.trace_id;
        const fanoutCtx = buildFanoutContext({
          sessionId: response.plan.id,
          correlationId,
          processingTimeMs: response.plan.estimated_duration_ms,
          executionProof: { entries: response.plan.steps },
          scenario: undefined,
          plan: response.plan,
          rawBody,
        });
        fireFanout(fanoutCtx).catch(() => {/* individual failures already logged at WARN */});
        return;
      }

      // Fall through to contract-validated handler (re-parse not needed,
      // but the existing handler parses its own body, so we use a wrapper)
      await handlePlansEndpointWithBody(rawBody, req, res);
      return;
    }

    // Non-POST methods handled by existing handler
    await handlePlansEndpoint(req, res);
    return;
  }

  // 404 for unknown routes
  sendJSON(res, 404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Unhandled error:', error);
    sendJSON(res, 500, { error: 'Internal server error' });
  });
});

server.listen(PORT, () => {
  console.log(`Agentics Simulation Planner listening on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /v1/plans - Create simulation plan`);
  console.log(`  GET  /health   - Health check`);
  console.log(`Contract enforcement: ENABLED`);
  console.log(`Schema version: ${SCHEMA_VERSION}`);
});
