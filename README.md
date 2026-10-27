# CareDesk-AI

CareDesk-AI is an intelligent clinic and appointment management system featuring automated WhatsApp integration, AI-assisted scheduling, and a modern web dashboard.

---

## DevOps Continuous Integration (CI) Pipeline

### Purpose of the CI Pipeline

The CareDesk-AI CI pipeline is configured using GitHub Actions (`.github/workflows/ci.yml`) to enforce code quality, verify production builds, and run automated backend tests on every pull request and push to key development branches (`main`, `develop`, `devops-cicd`).

Automating these checks ensures that:
- Code syntax and contracts are verified continuously.
- Backend endpoint validations and business rules remain intact across refactors.
- Uncaught exceptions, malformed request handling, and authentication requirements are tested before deployment.
- Broken dependencies or regressions immediately fail the pipeline, preventing bad code from being merged.

---

## Backend Automated Testing Architecture

### Testing Framework Selected

- **Test Runner**: Node.js built-in test runner (`node:test`)
- **Assertions**: Node.js strict assertion library (`node:assert/strict`)
- **HTTP Endpoint Testing**: `supertest` (development dependency for exercising Express routes without opening external network ports)

**Rationale**:
- Built into Node.js 22 LTS with zero configuration overhead and native ESM/CommonJS support.
- Extremely fast execution with minimal dependency bloat.
- TAP-compliant output compatible with modern CI reporters.
- `supertest` provides robust HTTP request/response assertions directly against the exported Express application.

### Application Architecture Separation

To support deterministic automated testing without binding to network ports:
- **`server/src/app.js`**: Creates and configures Express, CORS policies, JSON verification middleware, cookie parsing, route mounts, health check endpoints, and centralized error handling. Exports the configured Express app without calling `listen()`.
- **`server/src/server.js`**: Imports `app` from `./app`, sets the port, and starts listening on the configured port. Preserves full production and development startup behavior.

---

## Test Categories & Coverage

The test suite covers 71 comprehensive automated tests across the following categories:

| Test Suite | File | Category / What It Verifies |
| :--- | :--- | :--- |
| **Health Check** | `server/tests/health.test.js` | Verifies `GET /api/health` and `/health` return HTTP 200 with `{ status: "ok", uptime, timestamp }`, content-type `application/json`, without leaking credentials or internal paths. |
| **Successful API Responses** | `server/tests/api.test.js` | Verifies `POST /api/auth/logout` clears the authentication cookie and `GET /api/whatsapp/webhook` handles Meta verification handshakes. |
| **Input Validation** | `server/tests/api.test.js` | Verifies client errors (HTTP 400) when required signup fields are missing, passwords are under 8 characters, login credentials are absent, or webhook retry payloads lack `messageId`. |
| **Authentication & Authorization** | `server/tests/api.test.js` | Verifies protected routes (`/api/auth/me`, `/api/patients`, `/api/doctors`, `/api/dashboard`, `/api/appointments`) reject unauthenticated requests with HTTP 401, reject malformed JWTs, and accept valid tokens signed by `JWT_SECRET`. |
| **Error Handling & CORS** | `server/tests/api.test.js` | Verifies malformed JSON bodies return HTTP 400 without crashing, unknown routes return HTTP 404, unauthorized origins are rejected by CORS, and allowed client origins receive proper CORS headers. |
| **WhatsApp AI & Security** | `server/tests/whatsappSecurity.test.js` | Verifies Meta X-Hub-Signature-256 HMAC SHA-256 signature verification and payload tampering detection. |
| **Appointment Confirmation** | `server/tests/appointmentConfirmation.test.js` | Unit and mock-db verification of slot availability revalidation, state transition idempotency, TTL expiration, and replay prevention. |
| **WhatsApp Flow Integration** | `server/tests/whatsappBookingFlow.test.js`, `server/tests/whatsappConfirmationFlow.test.js`, `server/tests/whatsappRescheduleFlow.test.js`, `server/tests/whatsappOutboundDelivery.test.js` | Verifies sequential webhook queuing, message deduplication, outbound retry logic, and concurrent turn serialization. |

---

## Local Verification Commands

### 1. Prerequisites

- **Node.js**: Version 22 LTS or higher
- **npm**: Version 10 or higher

### 2. Dependency Installation

Install dependencies using clean, deterministic lockfile installations:

```bash
# Frontend
cd client
npm ci

# Backend
cd ../server
npm ci
```

> **Note**: The backend `npm ci` command automatically executes `postinstall` (`prisma generate`), ensuring the local Prisma Client is generated and up to date.

### 3. Running Backend Tests Locally

From the `server` directory:

```bash
# Run all automated tests
npm test

# Run a specific test suite
node --test tests/health.test.js
node --test tests/api.test.js
```

### 4. Running Backend Entry Point Verification

```bash
# From server directory
node --check src/server.js
node --check src/app.js
```

### 5. Running Frontend Quality Checks

From the `client` directory:

```bash
npm run lint
npm run build
```

---

## GitHub Actions CI Workflow

The workflow (`.github/workflows/ci.yml`) runs two parallel, independent jobs:

```mermaid
flowchart TD
    PushOrPR["Push / Pull Request to main, develop, devops-cicd"] --> FrontendJob["Frontend CI: Lint and Build"]
    PushOrPR --> BackendJob["Backend CI: Tests and Entry Point"]

    subgraph Frontend Job
        F1["actions/checkout@v4"] --> F2["actions/setup-node@v4 (Node 22)"]
        F2 --> F3["npm ci"]
        F3 --> F4["npm run lint (Oxlint)"]
        F4 --> F5["npm run build (Vite)"]
    end

    subgraph Backend Job
        B1["actions/checkout@v4"] --> B2["actions/setup-node@v4 (Node 22)"]
        B2 --> B3["npm ci (installs + prisma generate)"]
        B3 --> B4["npm test (node:test test suite)"]
        B4 --> B5["node --check src/server.js"]
    end
```

### Interpreting Workflow Failures

- **Frontend Lint Failure**: Oxlint detected an error (e.g. invalid syntax or broken imports).
- **Frontend Build Failure**: Vite bundle failed due to TypeScript/JSX syntax errors or missing assets.
- **Backend Test Failure (`npm test`)**: A backend assertion failed (e.g., status code changed, validation rule altered, or authentication bypass).
- **Backend Entry Point Failure (`node --check src/server.js`)**: JavaScript syntax error in `server.js` or an invalid import.

---

## Security Considerations & Best Practices

1. **No Credentials in Tests**: Tests run with dummy fixture secrets (`JWT_SECRET`, `WHATSAPP_VERIFY_TOKEN`) and never touch production credentials or external services.
2. **Database Isolation**: Unit and HTTP tests use in-memory state, mock adapters, or isolated test fixtures. No production database mutations occur during CI.
3. **No Secret Leaks**: Health and error endpoints explicitly filter out stack traces, environment variables, and connection strings.

---

## Phase 3 & 4: Docker Containerization & Docker Compose Integration

CareDesk-AI provides production-grade containerization and orchestration using Docker and Docker Compose.

### Architecture Overview

```
                      +---------------------------------------+
                      |               Host Machine            |
                      |                                       |
                      |  Browser: http://localhost:5173       |
                      |  Direct API: http://localhost:5001    |
                      +------------------+--------------------+
                                         |
                       Port 5173:80      |      Port 5001:5001
                      +------------------v--------------------+
                      |            caredesk-network           |
                      |            (Bridge Network)           |
                      |                                       |
                      |  +---------------------------------+  |
                      |  | caredesk-frontend               |  |
                      |  | - Nginx 1.27 Alpine             |  |
                      |  | - Port 80 (serves static SPA)   |  |
                      |  | - Reverse proxy /api/ to        |  |
                      |  |   http://backend:5001           |  |
                      |  +----------------+----------------+  |
                      |                   |                   |
                      |     Proxy /api/   |                   |
                      |                   v                   |
                      |  +---------------------------------+  |
                      |  | caredesk-backend                |  |
                      |  | - Node.js 22 Slim (Debian)      |  |
                      |  | - Non-root user (node)          |  |
                      |  | - Express + Prisma Client       |  |
                      |  | - Port 5001 (host 0.0.0.0)      |  |
                      |  | - Healthcheck: /api/health      |  |
                      |  +----------------+----------------+  |
                      |                   |                   |
                      +-------------------|-------------------+
                                          |
                                          v DATABASE_URL (SSL)
                      +---------------------------------------+
                      | Managed PostgreSQL Database           |
                      +---------------------------------------+
```

### Dockerfiles Design

#### Frontend (`client/Dockerfile`)
- **Stage 1 (Builder)**: `node:22-alpine` installs dependencies via `npm ci`, accepts build argument `VITE_API_URL` (defaults to `http://localhost:5001`), and compiles production assets with `npm run build`.
- **Stage 2 (Runtime)**: `nginx:1.27-alpine` serves the compiled static files (`/usr/share/nginx/html`). Configured via `client/nginx.conf` with:
  - SPA client-side routing fallback (`try_files $uri $uri/ /index.html`).
  - Gzip asset compression.
  - Static file cache headers (`Cache-Control: public, max-age=31536000, immutable`).
  - Dynamic Docker DNS resolution (`resolver 127.0.0.11`) and reverse proxy for `/api/` forwarding to `http://backend:5001`.
  - Container health check: `wget -q --spider http://127.0.0.1:80/`.

#### Backend (`server/Dockerfile`)
- **Base Image**: `node:22-slim` (Debian-based glibc compatibility for `@prisma/client`, `@prisma/adapter-pg`, and `bcrypt`).
- **Build Caching**: Copies `package.json`, `package-lock.json`, `prisma.config.ts`, and `prisma/schema.prisma` before source code.
- **Dependency Isolation**: Installs production dependencies only via `npm ci --omit=dev` and executes `prisma generate`.
- **Security**: Runs under unprivileged user `USER node`.
- **Binding**: Express listens on `0.0.0.0:${PORT:-5001}`.
- **Container Health Check**: Uses Node.js HTTP client to query `http://127.0.0.1:5001/api/health` without requiring external `curl` binaries.

---

### Prerequisites
- Docker Engine 24+ or Docker Desktop 4+ (with Compose v2+)
- WSL2 enabled (on Windows)

---

### Environment Variables Template

Create a `.env` file in the repository root by copying `.env.example`:

```bash
cp .env.example .env
```

| Variable | Scope | Default | Description |
| :--- | :--- | :--- | :--- |
| `BACKEND_PORT` | Host Mapping | `5001` | Host port mapped to backend container (5001). |
| `FRONTEND_PORT` | Host Mapping | `5173` | Host port mapped to frontend container (80). |
| `VITE_API_URL` | Frontend Build | `http://localhost:5001` | Backend URL used by host browser. |
| `PORT` | Backend Runtime | `5001` | Container port Express listens on. |
| `NODE_ENV` | Backend Runtime | `production` | Node environment flag. |
| `DATABASE_URL` | Backend Runtime | *Required* | PostgreSQL connection string. |
| `JWT_SECRET` | Backend Runtime | *Required* | JWT signing secret (min 32 characters). |
| `JWT_EXPIRES_IN` | Backend Runtime | `7d` | Token expiration period. |
| `CLIENT_ORIGIN` | Backend Runtime | `http://localhost:5173,http://localhost:80` | Allowed CORS origins for browser access. |
| `AI_BOOKING_ENABLED` | Backend Runtime | `false` | Enable AI-driven appointment creation. |
| `AI_APPOINTMENT_CHANGES_ENABLED` | Backend Runtime | `false` | Enable AI-driven cancellations/rescheduling. |
| `OPENROUTER_API_KEY` | Backend Runtime | *Optional* | API key for primary AI LLM router. |
| `GROQ_API_KEY` | Backend Runtime | *Optional* | API key for fallback Groq LLM. |
| `WHATSAPP_CLINIC_MAP` | Backend Runtime | `{}` | JSON map of Meta phone IDs to clinic IDs. |
| `WHATSAPP_VERIFY_TOKEN` | Backend Runtime | *Optional* | Meta webhook verification handshake token. |
| `WHATSAPP_ACCESS_TOKEN` | Backend Runtime | *Optional* | Meta Graph API access token. |
| `META_APP_SECRET` | Backend Runtime | *Optional* | Meta webhook HMAC SHA-256 verification secret. |

> [!IMPORTANT]
> Never commit `.env` files with production database URLs or secrets to version control. Both `.gitignore` and `.dockerignore` prevent credentials from being leaked into source control or Docker image layers.

---

### Docker Compose Lifecycle Commands

#### 1. Validate Configuration
```bash
docker compose config
```

#### 2. Build Services
```bash
docker compose build
```

#### 3. Start Application Stack (Detached)
```bash
docker compose up -d
```
*Docker Compose starts `backend`, waits until it passes health check (`service_healthy`), and then launches `frontend`.*

#### 4. Check Service Status & Health
```bash
docker compose ps
```

Expected status:
```text
NAME                IMAGE                       STATUS                    PORTS
caredesk-backend    caredesk-backend:compose    Up (healthy)              0.0.0.0:5001->5001/tcp
caredesk-frontend   caredesk-frontend:compose   Up (healthy)              0.0.0.0:5173->80/tcp
```

#### 5. Inspect Service Logs
```bash
# View last 100 log lines from all containers
docker compose logs --tail=100

# Stream logs continuously from a specific service
docker compose logs -f backend
docker compose logs -f frontend
```

#### 6. Restart Application Stack
```bash
docker compose restart
```

#### 7. Stop Application Stack Safely
```bash
docker compose down
```
> [!WARNING]
> Do NOT use `docker compose down -v` as the `-v` flag deletes named Docker volumes and local persistent data.

---

### Standalone Docker Execution (Optional)

To run images individually without Docker Compose:

```bash
# Build standalone images
docker build -t caredesk-backend:local ./server
docker build -t caredesk-frontend:local ./client

# Run backend container
docker run -d \
  --name caredesk-backend \
  -p 5001:5001 \
  -e NODE_ENV=production \
  -e PORT=5001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/caredesk" \
  -e JWT_SECRET="your-jwt-secret-min-32-chars" \
  caredesk-backend:local

# Run frontend container
docker run -d \
  --name caredesk-frontend \
  -p 5173:80 \
  caredesk-frontend:local
```

---

### Troubleshooting & Verification

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| `caredesk-backend` unhealthy on startup | Port conflict on 5001 or missing database network access | Verify `netstat -ano \| findstr 5001` on host and ensure `DATABASE_URL` is reachable. |
| Browser shows CORS error | Frontend running on non-default port | Set `CLIENT_ORIGIN=http://localhost:<port>` in `.env` or Compose environment. |
| Client route returns 404 upon browser reload | Missing SPA fallback | Confirm `client/nginx.conf` contains `try_files $uri $uri/ /index.html;`. |
| Prisma generation failure during build | Missing `schema.prisma` in context | Ensure `prisma/` folder is copied before `npm ci --omit=dev` in `server/Dockerfile`. |

---

## Phase 5: Container Registry Publishing (GHCR)

CareDesk-AI automates building and publishing production Docker images to GitHub Container Registry (GHCR) via GitHub Actions (`.github/workflows/ci.yml`).

### Registry & Image Coordinates

| Component | Registry | Image Name |
| :--- | :--- | :--- |
| **Backend API** | GitHub Container Registry (`ghcr.io`) | `ghcr.io/rutikgawali01/caredesk-backend` |
| **Frontend UI** | GitHub Container Registry (`ghcr.io`) | `ghcr.io/rutikgawali01/caredesk-frontend` |

*Note: In accordance with OCI and Docker registry requirements, repository and image names are strictly lowercase.*

### Automated Publishing Workflow

Images are built and published independently by GitHub Actions:

```mermaid
flowchart TD
    Push["Git Push to main, develop, devops-cicd or Tag v*"] --> CI

    subgraph CI["Mandatory Quality Gate"]
        F_CI["Frontend CI: Lint & Build"]
        B_CI["Backend CI: 71 Tests & Syntax"]
    end

    F_CI & B_CI --> Gate{"All CI Checks Passed?"}
    Gate -->|No| Fail["Pipeline Fails - No Images Published"]
    Gate -->|Yes| CheckPR{"Is Pull Request?"}

    CheckPR -->|Yes| Skip["Skip Publishing (Fork Security)"]
    CheckPR -->|No| Publish["Publish to GHCR"]

    subgraph Publish["Independent Publishing Jobs"]
        P_Back["Publish Backend: ghcr.io/.../caredesk-backend"]
        P_Front["Publish Frontend: ghcr.io/.../caredesk-frontend"]
    end
```

### Tagging Strategy

| Tag Type | Example | Usage / Retention Policy |
| :--- | :--- | :--- |
| **Short Commit SHA** | `sha-edbad23` | **Immutable tag** generated on every commit. Primary tag for deterministic rollbacks and GitOps deployments. |
| **Full Commit SHA** | `sha-edbad23819ad8b98634d451618676c4493d3138b` | Full cryptographic trace to the Git commit. |
| **Branch Ref** | `devops-cicd`, `develop` | Tracks the latest build of an active development branch. Overwritten on subsequent pushes. |
| **Semantic Version** | `v1.0.0`, `1.0.0`, `1.0` | Produced automatically when pushing Git release tags (e.g. `git tag v1.0.0 && git push origin v1.0.0`). |
| **Latest** | `latest` | Updated only on pushes to `main` or semantic version tags. Never updated on unstable branch pushes. |

### Pulling Published Images

#### Authenticating to GHCR
If the images or repository packages are private:
```bash
# Log in with your GitHub Personal Access Token (PAT) with read:packages scope
echo $CR_PAT | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin
```

#### Pull Commands
```bash
# Pull by immutable commit SHA (Recommended for production):
docker pull ghcr.io/rutikgawali01/caredesk-backend:sha-<commit_sha>
docker pull ghcr.io/rutikgawali01/caredesk-frontend:sha-<commit_sha>

# Pull by branch tag:
docker pull ghcr.io/rutikgawali01/caredesk-backend:devops-cicd
docker pull ghcr.io/rutikgawali01/caredesk-frontend:devops-cicd

# Pull by release version:
docker pull ghcr.io/rutikgawali01/caredesk-backend:v1.0.0
docker pull ghcr.io/rutikgawali01/caredesk-frontend:v1.0.0
```

#### Running Published Images
```bash
# Run backend container
docker run -d \
  --name caredesk-backend \
  -p 5001:5001 \
  -e PORT=5001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/caredesk?sslmode=require" \
  -e JWT_SECRET="your-jwt-secret-min-32-chars" \
  ghcr.io/rutikgawali01/caredesk-backend:devops-cicd

# Run frontend container
docker run -d \
  --name caredesk-frontend \
  -p 5173:80 \
  ghcr.io/rutikgawali01/caredesk-frontend:devops-cicd
```


