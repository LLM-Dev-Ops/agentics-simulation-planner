/**
 * HTTP Server for Agentics Simulation Planner
 * Exposes /v1/plans endpoint for Cloud Run deployment
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { planSimulation, createMinimalContext, type PlanningInput, type PlanningOptions } from './core/planner.js';

const PORT = parseInt(process.env['PORT'] || '8080', 10);

interface RequestBody {
  intent: string;
  organizationName?: string;
  organizationId?: string;
  seed?: string;
  namespace?: string;
}

function parseBody(req: IncomingMessage): Promise<RequestBody> {
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
  if (req.method !== 'POST') {
    sendJSON(res, 405, { error: 'Method not allowed', allowed: ['POST'] });
    return;
  }

  try {
    const body = await parseBody(req);

    if (!body.intent) {
      sendJSON(res, 400, { error: 'Missing required field: intent' });
      return;
    }

    // Create organizational context
    const context = createMinimalContext(
      body.organizationName || 'Default Organization',
      body.organizationId
    );

    const input: PlanningInput = {
      intent: body.intent,
      context,
    };

    const options: PlanningOptions = {};
    if (body.seed) {
      (options as { seed?: string }).seed = body.seed;
    }
    if (body.namespace) {
      (options as { namespace?: string }).namespace = body.namespace;
    }

    const result = await planSimulation(input, options);

    sendJSON(res, 200, {
      success: true,
      plan: result.plan,
      sessionId: result.sessionId,
      contentHash: result.contentHash,
      processingTimeMs: result.processingTimeMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    sendJSON(res, 500, { error: message });
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';

  // Health check endpoint
  if (url === '/health' || url === '/') {
    sendJSON(res, 200, { status: 'healthy', service: 'agentics-planner' });
    return;
  }

  // Plans endpoint
  if (url === '/v1/plans') {
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
});
