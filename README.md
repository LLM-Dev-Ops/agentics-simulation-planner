# Agentics Simulation Planner

[![Cloud Run](https://img.shields.io/badge/Google%20Cloud-Run-4285F4?logo=google-cloud&logoColor=white)](https://agentics-simulation-planner-275061967156.us-central1.run.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contract Enforced](https://img.shields.io/badge/Contract-Enforced-success)](src/contracts)

> Translates natural language organizational goals into deterministic, machine-readable SimulationPlan artifacts using an 8-stage planning pipeline.

---

## 🎯 Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AGENTICS SIMULATION PLANNER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   "Optimize warehouse        ┌──────────────────┐      SimulationPlan      │
│    operations for     ────▶  │   8-Stage        │  ────▶  {                │
│    peak season"              │   Pipeline       │         objectives,      │
│                              └──────────────────┘         agents,          │
│                                                           workflows,       │
│                                                           constraints      │
│                                                         }                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

The Agentics Simulation Planner is a **planning-only** service that:
- Parses natural language intents into structured objectives
- Decomposes complex goals into atomic, executable tasks
- Maps organizational topology to agent archetypes
- Generates deterministic execution plans for the simulation engine

**It does NOT execute simulations** — that's the responsibility of `agentics-simulation-engine`.

---

## 🏗️ Architecture

```
                              ┌─────────────────────────────────────┐
                              │         REQUEST ENTRY               │
                              │   POST /v1/plans                    │
                              └──────────────┬──────────────────────┘
                                             │
                              ┌──────────────▼──────────────────────┐
                              │      CONTRACT VALIDATION            │
                              │  @agentics/contracts                │
                              │  simulation/v1/request.schema.json  │
                              └──────────────┬──────────────────────┘
                                             │ ✓ Valid
                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         8-STAGE PLANNING PIPELINE                          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │   Stage 1   │   │   Stage 2   │   │   Stage 3   │   │   Stage 4   │   │
│  │   Intent    │──▶│   Intent    │──▶│  Topology   │──▶│   Agent     │   │
│  │  Ingestion  │   │Decomposition│   │ Extraction  │   │  Expansion  │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   │
│                                                                  │        │
│                                                                  ▼        │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │   Stage 8   │   │   Stage 7   │   │   Stage 6   │   │   Stage 5   │   │
│  │Serialization│◀──│ Validation  │◀──│ Constraint  │◀──│ Integration │   │
│  │             │   │Normalization│   │ Resolution  │   │  Discovery  │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘   │
│         │                                                                  │
└─────────┼──────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RESPONSE                                         │
│  {                                                                          │
│    "success": true,                                                         │
│    "plan": SimulationPlan,        ◀── Deterministic output                 │
│    "executionProof": {...},       ◀── Cryptographic evidence               │
│    "validationResult": {...}      ◀── Contract compliance                  │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Live API

The service is deployed on Google Cloud Run:

```bash
# Health check
curl https://agentics-simulation-planner-275061967156.us-central1.run.app/health

# Create a simulation plan
curl -X POST https://agentics-simulation-planner-275061967156.us-central1.run.app/v1/plans \
  -H "Content-Type: application/json" \
  -d '{"intent": "Optimize warehouse operations for peak season"}'
```

### Local Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Start server
node dist/server.js
```

---

## 📋 API Reference

### `POST /v1/plans`

Create a simulation plan from natural language intent.

#### Request Schema

```typescript
{
  // Required: Natural language goal (1-10,000 chars)
  intent: string;

  // Optional: Organization details
  organizationName?: string;
  organizationId?: string;  // UUID format

  // Optional: Determinism control
  seed?: string;
  namespace?: string;

  // Optional: Simulation configuration
  config?: {
    targetEngine?: {
      engine: "agentics-simulation-engine";
      versionConstraint: string;  // e.g., "^1.0.0"
      requiredCapabilities?: string[];
    };
    scope?: {
      type?: "FULL" | "PARTIAL" | "INCREMENTAL";
      domains?: ("FINANCE" | "HUMAN_RESOURCES" | "OPERATIONS" | ...)[];
      timeHorizon?: { startDate?, endDate?, granularity? };
    };
    constraints?: {
      temporal?: { startAfter?, completeBefore?, maxDurationMs? };
      resource?: { maxAgents?, maxConcurrency?, maxMemoryMB? };
    };
  };

  // Optional: Scenario definition
  scenario?: {
    scenarioId: string;  // UUID
    name: string;
    parameters?: Record<string, any>;
    assumptions?: Array<{ id, statement, category?, confidence? }>;
  };
}
```

#### Response

```typescript
{
  success: boolean;
  plan?: SimulationPlan;        // The generated plan
  sessionId?: string;           // Session UUID for tracing
  contentHash?: string;         // SHA-256 for determinism verification
  processingTimeMs?: number;    // Pipeline execution time

  // Always included - even on errors
  executionProof: ExecutionProof;
  validationResult: ContractValidationResult;

  // On error
  error?: {
    code: string;
    message: string;
    details?: ValidationErrorDetail[];
  };
}
```

---

## 🔒 Contract Enforcement

All requests are validated against `@agentics/contracts` **before** any planning logic executes.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTRACT ENFORCEMENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ Validation occurs BEFORE planning                           │
│  ✓ Invalid requests fail immediately                           │
│  ✓ No permissive paths or inferred defaults                    │
│  ✓ Additional properties are rejected                          │
│  ✓ All responses include execution proof                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Proof

Every response includes cryptographic proof of what the planner did:

```json
{
  "executionProof": {
    "proofId": "uuid",
    "sessionId": "uuid",
    "requestHash": "sha256...",
    "responseHash": "sha256...",
    "entries": [
      {
        "stage": "CONTRACT_VALIDATION",
        "operation": "VALIDATE_REQUEST",
        "inputHash": "sha256...",
        "outputHash": "sha256...",
        "decision": "ACCEPTED"
      },
      {
        "stage": "INTENT_INGESTION",
        "operation": "INGEST_INTENT",
        "decision": "COMPLETED"
      }
    ],
    "stageCount": 9,
    "totalDurationMs": 38
  }
}
```

---

## 📊 SimulationPlan Output

The planner produces a comprehensive `SimulationPlan` artifact:

```
┌─────────────────────────────────────────────────────────────────┐
│                     SIMULATION PLAN v2.0.0                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  metadata          Plan ID, timestamp, content hash, trace ID  │
│  ───────────────────────────────────────────────────────────── │
│  objectives[]      Atomic goals with targets and priorities    │
│  ───────────────────────────────────────────────────────────── │
│  agents[]          Agent specs with capabilities & resources   │
│  ───────────────────────────────────────────────────────────── │
│  workflows[]       Step-by-step execution workflows            │
│  ───────────────────────────────────────────────────────────── │
│  constraints       Temporal, resource, and dependency limits   │
│  ───────────────────────────────────────────────────────────── │
│  execution         Strategy, phases, and rollback policy       │
│  ───────────────────────────────────────────────────────────── │
│  executionGraph    DAG of steps with dependencies              │
│  ───────────────────────────────────────────────────────────── │
│  auditTrail[]      Complete decision history                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration

# Type checking
npm run typecheck
```

**Test Coverage:**
- 360 tests across 17 test suites
- Contract validation tests
- Execution proof tests
- Pipeline stage tests
- Integration tests

---

## 📁 Project Structure

```
src/
├── contracts/              # @agentics/contracts
│   ├── schemas/           # JSON Schema definitions
│   │   └── simulation/v1/
│   │       └── request.schema.json
│   ├── types.ts           # Contract TypeScript types
│   ├── validator.ts       # Request validation
│   ├── execution-proof.ts # Proof generation
│   └── index.ts           # Contract exports
│
├── core/                   # Core planner
│   ├── planner.ts         # Main entry point
│   └── simulation-plan-builder.ts
│
├── modules/                # 8-stage pipeline
│   ├── intent-ingestion.ts
│   ├── intent-decomposition.ts
│   ├── topology-extraction.ts
│   ├── agent-workflow-expansion.ts
│   ├── integration-discovery.ts
│   ├── constraint-resolution.ts
│   ├── validation-normalization.ts
│   └── simulation-plan-serialization.ts
│
├── types/                  # TypeScript definitions
│   ├── simulation-plan.ts
│   ├── erp-surface.ts
│   ├── agent.ts
│   └── ...
│
├── adapters/               # State management
│   └── ruvvector-adapter.ts
│
├── utils/                  # Utilities
│   ├── crypto.ts          # SHA-256, deterministic IDs
│   └── text.ts            # Text processing
│
├── server.ts               # HTTP server
└── index.ts                # Public API
```

---

## 🔗 Integration with Agentics Ecosystem

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│                  │      │                  │      │                  │
│  Natural Language│─────▶│    PLANNER       │─────▶│  Simulation      │
│  Intent          │      │  (this service)  │      │  Engine          │
│                  │      │                  │      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
                                   │
                                   │ References
                                   ▼
                          ┌──────────────────┐
                          │                  │
                          │   ERP Adapter    │
                          │  (data fetching) │
                          │                  │
                          └──────────────────┘
```

**Boundary Enforcement:**
- Planner produces plans, does NOT execute
- ERP data references are abstract (fetched by erp-adapter)
- ROI calculations delegated to analytics-service
- Execution delegated to agentics-simulation-engine

---

## 🛠️ Deployment

### Google Cloud Run

```bash
# Set project
gcloud config set project agentics-cloud

# Deploy
gcloud run deploy agentics-simulation-planner \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi
```

### Docker

```bash
# Build
docker build -t agentics-simulation-planner .

# Run
docker run -p 8080:8080 agentics-simulation-planner
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

---

<p align="center">
  <strong>Built with ❤️ by the Agentics Platform Team</strong>
</p>
