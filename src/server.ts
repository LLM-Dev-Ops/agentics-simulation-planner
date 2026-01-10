/**
 * HTTP Server for Agentics Simulation Planner
 * Exposes /v1/plans endpoint for Cloud Run deployment
 *
 * IMPORTANT: All requests are validated against @agentics/contracts
 * BEFORE any planning operations begin.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  planSimulationWithContract,
  type ContractPlanningInput,
} from './core/planner.js';
import {
  parseAndValidateRequest,
  ContractValidationError,
  createValidationFailureProof,
  type ContractValidationResult,
  type ExecutionProof,
  type ExecutionMetadata,
} from './contracts/index.js';
import { getCurrentTimestampUTC } from './utils/text.js';
import { SCHEMA_VERSION } from './contracts/validator.js';

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
 */
interface PlanningResponse {
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
    };

    sendJSON(res, 200, response);
  } catch (error) {
    // Handle contract validation errors specifically
    if (error instanceof ContractValidationError) {
      const proof = createValidationFailureProof(rawBody, error.errors);
      const processingTimeMs = Date.now() - requestStartTime;
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
    };
    sendJSON(res, 500, response);
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';

  // Health check endpoint
  if (url === '/health' || url === '/') {
    sendJSON(res, 200, { status: 'healthy', service: 'agentics-simulation-planner' });
    return;
  }

  // Plans endpoint - support multiple paths for CLI compatibility
  if (url === '/v1/plans' || url === '/v1/plan' || url === '/plan' || url === '/plans') {
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
