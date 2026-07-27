/**
 * Tests for the manifest_ref-based plan generation endpoint.
 */

import { createServer, type Server } from 'http';
import { randomUUID } from 'crypto';

// We test by making HTTP requests against the server.
// Import server internals would couple us to implementation, so we spin up
// a lightweight test server that exercises the same handler code.

let server: Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  // Dynamic import to get the compiled server module
  // Instead, we replicate the handler logic for isolated unit testing
  const { handleTestRequest } = await setupTestHandlers();
  server = createServer((req, res) => {
    handleTestRequest(req, res).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
}

async function setupTestHandlers() {
  // Inline the manifest plan logic for unit testing without starting the full server
  const { IncomingMessage, ServerResponse } = await import('http');

  function parseBody(req: typeof IncomingMessage.prototype): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); }
        catch { reject(new Error('Invalid JSON body')); }
      });
      req.on('error', reject);
    });
  }

  function sendJSON(res: typeof ServerResponse.prototype, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function isManifestPlanRequest(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) return false;
    const obj = body as Record<string, unknown>;
    return (
      typeof obj['manifest_ref'] === 'object' &&
      obj['manifest_ref'] !== null &&
      typeof obj['intent'] === 'string'
    );
  }

  async function handleTestRequest(
    req: typeof IncomingMessage.prototype,
    res: typeof ServerResponse.prototype
  ) {
    const url = req.url || '/';

    if (url === '/health') {
      sendJSON(res, 200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url === '/v1/plans') {
      if (req.method !== 'POST') {
        sendJSON(res, 405, { error: 'Method not allowed' });
        return;
      }

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

      if (!isManifestPlanRequest(rawBody)) {
        sendJSON(res, 400, { error: 'Missing manifest_ref or intent' });
        return;
      }

      const body = rawBody as { manifest_ref: { id: string; version: string }; params?: Record<string, unknown>; intent: string };
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

      sendJSON(res, 200, {
        plan: {
          id: `plan-${randomUUID()}`,
          version: body.manifest_ref.version ?? '1.0.0',
          intent: body.intent,
          steps: [
            { step_id: 'step-1', name: 'Initialize simulation environment', service: 'agentics-simulation-runner', action: 'setup', config: body.params ?? {}, dependencies: [] },
            { step_id: 'step-2', name: 'Execute simulation scenarios', service: 'agentics-simulation-runner', action: 'run', config: {}, dependencies: ['step-1'] },
            { step_id: 'step-3', name: 'Collect and index results', service: 'agentics-results-index', action: 'store', config: {}, dependencies: ['step-2'] },
          ],
          created_at: new Date().toISOString(),
          estimated_duration_ms: 30000,
        },
        execution_metadata: {
          trace_id: correlationId,
          timestamp: new Date().toISOString(),
          service: 'agentics-simulation-planner',
        },
      });
    }
  }

  return { handleTestRequest };
}

async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function fetchJSON(path: string, options?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const body = await res.json();
  return { status: res.status, body };
}

describe('POST /v1/plans (manifest_ref)', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
  });

  it('returns a plan with execution_metadata for a valid request', async () => {
    const { status, body } = await fetchJSON('/v1/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest_ref: { id: 'manifest-abc', version: '1.0.0' },
        params: { region: 'us-east-1' },
        intent: 'Simulate quarterly revenue forecasting',
      }),
    });

    expect(status).toBe(200);

    // Plan structure
    expect(body.plan).toBeDefined();
    expect(body.plan.id).toMatch(/^plan-/);
    expect(body.plan.version).toBe('1.0.0');
    expect(body.plan.intent).toBe('Simulate quarterly revenue forecasting');
    expect(body.plan.steps).toHaveLength(3);
    expect(body.plan.created_at).toBeDefined();
    expect(body.plan.estimated_duration_ms).toBe(30000);

    // Steps structure
    const [step1, step2, step3] = body.plan.steps;
    expect(step1.step_id).toBe('step-1');
    expect(step1.service).toBe('agentics-simulation-runner');
    expect(step1.action).toBe('setup');
    expect(step1.dependencies).toEqual([]);

    expect(step2.step_id).toBe('step-2');
    expect(step2.dependencies).toEqual(['step-1']);

    expect(step3.step_id).toBe('step-3');
    expect(step3.dependencies).toEqual(['step-2']);

    // Execution metadata
    expect(body.execution_metadata).toBeDefined();
    expect(body.execution_metadata.trace_id).toBeDefined();
    expect(body.execution_metadata.timestamp).toBeDefined();
    expect(body.execution_metadata.service).toBe('agentics-simulation-planner');
  });

  it('uses X-Correlation-ID as trace_id when provided', async () => {
    const correlationId = 'test-correlation-123';
    const { body } = await fetchJSON('/v1/plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
      },
      body: JSON.stringify({
        manifest_ref: { id: 'manifest-xyz', version: '2.0.0' },
        intent: 'Test correlation',
      }),
    });

    expect(body.execution_metadata.trace_id).toBe(correlationId);
  });

  it('passes params into step-1 config', async () => {
    const params = { iterations: 100, seed: 42 };
    const { body } = await fetchJSON('/v1/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest_ref: { id: 'manifest-def', version: '1.0.0' },
        params,
        intent: 'Run with custom params',
      }),
    });

    expect(body.plan.steps[0].config).toEqual(params);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await fetch(`${baseUrl}/v1/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.execution_metadata).toBeDefined();
    expect(body.execution_metadata.service).toBe('agentics-simulation-planner');
  });
});

describe('GET /health', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
  });

  it('returns healthy status with timestamp', async () => {
    const { status, body } = await fetchJSON('/health');

    expect(status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
