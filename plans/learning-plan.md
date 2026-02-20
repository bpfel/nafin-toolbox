# nafin-toolbox Learning Plan

> Learn Go, Svelte 5, PostgreSQL, Docker, and web architecture by building your own finance app.
> Each lesson uses real code from this project. Progress is tracked here across sessions.

---

## How to Use This Plan

1. **Start a lesson**: Tell Claude "Let's do lesson N" or "Continue my learning plan"
2. **Ask questions**: Anytime during a lesson, ask "Why does X work like that?" or "Explain Y"
3. **Check understanding**: Each lesson ends with quiz questions — answer them to Claude
4. **Mark progress**: Claude updates the checkboxes below as you complete lessons
5. **Add features**: Say "I want to build X" and Claude will create a new lesson for it
6. **Resume**: In a new session, say "Continue my learning plan" — Claude reads this file

---

## Progress Overview

| # | Lesson | Status | Date Completed |
|---|--------|--------|----------------|
| 1 | Go Basics | pending | |
| 2 | SQL & Database Design | pending | |
| 3 | HTTP & REST APIs | pending | |
| 4 | Go Web Patterns (Router, Middleware) | pending | |
| 5 | Svelte 5 Fundamentals | pending | |
| 6 | TypeScript & API Clients | pending | |
| 7 | Docker & Deployment | pending | |
| 8 | Repository Pattern & Data Access | pending | |
| 9 | HTTP Handlers & Validation | pending | |
| 10 | Svelte 5 Advanced (Forms, State, Stores) | pending | |
| 11 | Testing (Go + TypeScript) | pending | |
| 12 | Authentication & Security | pending | |
| 13 | End-to-End Encryption (E2EE) | pending | |

---

## Part 1: Foundations

### Lesson 1: Go Basics
**Goal:** Understand Go syntax, types, functions, and program structure
**Code to study:**
- `backend/main.go` — entry point, how a Go program starts
- `backend/internal/database/db.go` — functions, error handling, defer
- `backend/internal/module/module.go` — constants, maps, types, interfaces

**Topics:**
- [ ] Package declaration and imports
- [ ] `func main()` — where it all starts
- [ ] Variables, constants, types (string, int, map, slice)
- [ ] Multiple return values and error handling (`val, err := ...`)
- [ ] `defer` for cleanup
- [ ] Structs and interfaces
- [ ] Exported vs unexported (capital letter convention)

**Quiz:**
1. What does `defer db.Close()` do and why is it placed right after opening the connection?
2. Why does Go return `(*pgxpool.Pool, error)` instead of just `*pgxpool.Pool`?
3. What's the difference between `Module` and `module` in Go?
4. Look at `module.go` — what is a `map[string]string` and how is `KnownModules` used?

---

### Lesson 2: SQL & Database Design
**Goal:** Read and write SQL schemas, understand relational data modeling
**Code to study:**
- `backend/migrations/001_init.sql` — full schema with constraints
- `backend/internal/database/migrate.go` — how migrations are applied

**Topics:**
- [ ] CREATE TABLE, columns, data types
- [ ] Primary keys (SERIAL) and auto-increment
- [ ] Foreign keys and REFERENCES
- [ ] CHECK constraints, UNIQUE constraints
- [ ] ON DELETE CASCADE — what it means
- [ ] NUMERIC(14,4) — why precision matters for money
- [ ] TIMESTAMPTZ — time zones in databases
- [ ] How the migration runner tracks which migrations have run

**Quiz:**
1. Why does `budget_entries` have a foreign key to both `budget_categories` AND `budget_periods`?
2. What would happen if you delete a category that has entries, given `ON DELETE CASCADE`?
3. Why use `NUMERIC(14,4)` instead of `FLOAT` for money?
4. What does the `schema_migrations` table do and why is each migration run inside a transaction?

---

### Lesson 3: HTTP & REST APIs
**Goal:** Understand how web APIs work — requests, responses, methods, status codes
**Code to study:**
- `backend/internal/module/handler.go` — simple CRUD handler
- `frontend/src/lib/api/client.ts` — the caller side

**Topics:**
- [ ] HTTP methods: GET, POST, PUT, DELETE and when to use each
- [ ] URL paths and route parameters (`/api/modules/{id}`)
- [ ] Request body (JSON) and response body
- [ ] Status codes: 200, 201, 400, 404, 405, 500
- [ ] Content-Type headers
- [ ] What JSON is and how it maps to Go structs / TypeScript interfaces
- [ ] How the frontend `fetch()` calls the backend

**Quiz:**
1. Why does `EnableModule` return 201 instead of 200?
2. What happens if you send a POST request to a GET-only endpoint?
3. In `handler.go`, why does every handler check `err != nil` and return early?
4. Look at `client.ts` — what does `credentials: 'include'` do?

---

### Lesson 4: Go Web Patterns (Router, Middleware)
**Goal:** Understand how requests flow through a Go web server
**Code to study:**
- `backend/internal/server/server.go` — router setup, middleware chain, route groups

**Topics:**
- [ ] Chi router — `r.Route()`, `r.Get()`, `r.Post()`, `r.Delete()`
- [ ] Route groups and sub-routers
- [ ] Middleware: what it is, how it wraps handlers
- [ ] CORS middleware — why it exists, what it configures
- [ ] `chi.URLParam()` — extracting values from URL paths
- [ ] `http.ListenAndServe()` — starting the server
- [ ] How `server.go` wires everything together

**Quiz:**
1. What is middleware and why would you use it instead of putting logic in every handler?
2. Why does the CORS middleware allow `credentials: true`?
3. Trace a request from the browser to handler: what middleware does it pass through?
4. Why are budget routes nested under `/api/budget` as a group?

---

### Lesson 5: Svelte 5 Fundamentals
**Goal:** Understand Svelte components, reactivity with runes, and rendering
**Code to study:**
- `frontend/src/App.svelte` — root component, state management
- `frontend/src/modules/budget/BudgetSummary.svelte` — simple display component
- `frontend/src/modules/budget/MonthSelector.svelte` — simple interactive component

**Topics:**
- [ ] Component structure: `<script>`, HTML template, `<style>`
- [ ] `$state()` — reactive variables
- [ ] `$derived()` — computed values
- [ ] `$effect()` — side effects (like useEffect)
- [ ] `$props()` — receiving data from parent
- [ ] `{#if}`, `{#each}` — conditional and list rendering
- [ ] Event handling: `onclick`, `onchange`
- [ ] Scoped CSS — styles only apply to their component

**Quiz:**
1. What's the difference between `$state` and `$derived`?
2. In `App.svelte`, how does the app know which module to show?
3. Why does `$effect` exist — what problem does it solve?
4. Look at MonthSelector — how does clicking "next month" update the parent component?

---

### Lesson 6: TypeScript & API Clients
**Goal:** Understand TypeScript types and how to build a typed API client
**Code to study:**
- `frontend/src/lib/api/client.ts` — full API client

**Topics:**
- [ ] TypeScript vs JavaScript — what types add
- [ ] Interfaces: defining shapes of data
- [ ] `async` / `await` — handling asynchronous operations
- [ ] `fetch()` API — making HTTP requests from the browser
- [ ] Error handling with try/catch
- [ ] How the API client mirrors the backend endpoints
- [ ] Type safety: catching bugs at compile time

**Quiz:**
1. Why define a `Category` interface instead of using `any`?
2. What does `async` do to a function's return type?
3. How does `apiFetch` centralize error handling for all API calls?
4. What would happen if the backend changed a field name but the frontend wasn't updated?

---

### Lesson 7: Docker & Deployment
**Goal:** Understand containers, multi-stage builds, and service orchestration
**Code to study:**
- `docker-compose.yml` — service orchestration
- `backend/Dockerfile` — multi-stage Go build
- `frontend/Dockerfile` — multi-stage Svelte build
- `frontend/nginx.conf` — reverse proxy and SPA serving

**Topics:**
- [ ] What Docker containers are and why they're useful
- [ ] Dockerfile: FROM, COPY, RUN, CMD
- [ ] Multi-stage builds — why the Go image is so small
- [ ] `CGO_ENABLED=0` — building a static binary
- [ ] Docker Compose: defining multiple services
- [ ] `depends_on` with health checks — startup ordering
- [ ] Volumes — persistent data for the database
- [ ] nginx: reverse proxy `/api/` to backend, serve SPA files
- [ ] `try_files` — how SPA routing works with nginx

**Quiz:**
1. Why does the Go Dockerfile have two FROM lines?
2. What would happen if the database starts after the API server tries to connect?
3. Why does nginx proxy `/api/` requests to the backend instead of the browser calling the backend directly?
4. What does `try_files $uri $uri/ /index.html` do for a single-page app?

---

## Part 2: Intermediate

### Lesson 8: Repository Pattern & Data Access
**Goal:** Build data access layers with Go store patterns and SQL
**Code to study:**
- `backend/internal/vault/store.go` — vault data persistence
- `backend/internal/vault/model.go` — domain models
- `backend/internal/auth/store.go` — auth repository with complex queries
- `backend/internal/module/module.go` — simple key-value store pattern

**Topics:**
- [ ] Repository/store pattern — separating data access from business logic
- [ ] SQL queries with pgx: `QueryRow`, `Exec`, `Query`
- [ ] Parameterized queries ($1, $2) — preventing SQL injection
- [ ] Scanning query results into Go structs
- [ ] Database transactions (`tx.Begin()`, `tx.Commit()`, `tx.Rollback()`)
- [ ] `COALESCE` and handling NULL values
- [ ] INSERT ... ON CONFLICT (upsert pattern in vault store)
- [ ] `context.Context` — why every store method takes it

**Quiz:**
1. In `vault/store.go`, why does `SaveVaultData` use an upsert instead of separate insert/update?
2. What's the difference between `QueryRow` and `Query` in pgx?
3. Why does every store method accept `context.Context` as the first parameter?
4. How does the auth store handle session lookup — what SQL patterns does it use?

---

### Lesson 9: HTTP Handlers & Input Validation
**Goal:** Write secure, robust HTTP handlers with proper validation
**Code to study:**
- `backend/internal/vault/handler.go` — vault CRUD endpoints
- `backend/internal/auth/handler.go` — auth endpoints with complex validation
- `backend/internal/module/handler.go` — simple CRUD handler

**Topics:**
- [ ] Handler structure: parse input → validate → call store → write response
- [ ] JSON decoding: `json.NewDecoder(r.Body).Decode()`
- [ ] Input validation: checking required fields, valid ranges, types
- [ ] HTTP method routing and 405 Method Not Allowed
- [ ] Writing JSON responses with proper status codes
- [ ] Auth context: extracting user from middleware (`auth.UserFromContext`)
- [ ] Request context and cancellation
- [ ] Business logic in handlers vs stores — where to draw the line

**Quiz:**
1. Why validate input in the handler before calling the store?
2. In `vault/handler.go`, how does the handler know which user's vault to access?
3. Why does `auth/handler.go` have rate limiting on login but not on other endpoints?
4. What happens if the JSON body has extra fields not in the struct?

---

### Lesson 10: Svelte 5 Advanced (Forms, State, Stores)
**Goal:** Build complex interactive UIs and manage application state with Svelte 5
**Code to study:**
- `frontend/src/modules/budget/BudgetEntryRow.svelte` — inline editing, state sync
- `frontend/src/modules/budget/BudgetTable.svelte` — group management, modals
- `frontend/src/lib/crypto/vaultStore.svelte.ts` — reactive store with encryption
- `frontend/src/lib/auth/authStore.svelte.ts` — auth state management

**Topics:**
- [ ] Complex local state with `$state` and `$effect`
- [ ] Custom stores with `.svelte.ts` files — encapsulating reactive state
- [ ] `untrack()` — when and why to break reactivity
- [ ] Two-way binding vs controlled inputs
- [ ] Focus management (programmatic focus, blur events)
- [ ] Keyboard navigation (Enter to save, Escape to cancel)
- [ ] Responsive design: mobile vs desktop views, long-press interactions
- [ ] Modal patterns: add/delete confirmation dialogs
- [ ] How vaultStore coordinates encryption, decryption, and UI state

**Quiz:**
1. In BudgetEntryRow, why use `untrack()` when syncing monthly ↔ yearly amounts?
2. How does `vaultStore.svelte.ts` keep the UI in sync with encrypted vault data?
3. What's the difference between a `.svelte.ts` store and a plain `.ts` module?
4. How does the auth store handle session expiry and vault lock?

---

### Lesson 11: Testing (Go + TypeScript)
**Goal:** Write comprehensive tests for both backend and frontend
**Code to study:**
- `backend/internal/vault/handler_test.go` — HTTP handler tests with mocked store
- `backend/internal/auth/ratelimit_test.go` — table-driven unit tests
- `backend/internal/auth/store_integration_test.go` — tests with real Postgres
- `frontend/src/lib/crypto/keys.test.ts` — crypto unit tests with Vitest
- `frontend/src/lib/budget/budgetEngine.test.ts` — business logic tests

**Topics:**
- [ ] `go test` — running tests, flags (-v, -run)
- [ ] Table-driven tests — the Go idiom for test cases
- [ ] `httptest` — testing HTTP handlers without a server
- [ ] Interfaces for testability (`VaultStorer` interface for mocking)
- [ ] Integration tests with real database vs unit tests with mocks
- [ ] Vitest — frontend test runner (describe, it, expect)
- [ ] Testing async code and crypto operations in TypeScript
- [ ] Edge cases: empty inputs, boundary values, error conditions
- [ ] Running tests in Docker (no local Go)
- [ ] CI pipeline: parallel test jobs in GitHub Actions

**Quiz:**
1. Why use table-driven tests instead of separate test functions?
2. How does `VaultStorer` interface make `vault/handler_test.go` testable without a database?
3. In `keys.test.ts`, how do you test crypto operations that use Web Crypto API?
4. When should you use integration tests (real DB) vs unit tests (mocked store)?

---

### Lesson 12: Authentication & Security
**Goal:** Understand web authentication, session management, and security
**Code to study:**
- `backend/internal/auth/handler.go` — login, logout, setup, invite, 2FA
- `backend/internal/auth/middleware.go` — RequireAuth middleware
- `backend/internal/auth/password.go` — bcrypt hashing
- `backend/internal/auth/ratelimit.go` — per-endpoint rate limiting
- `backend/internal/auth/store.go` — session and user persistence

**Topics:**
- [ ] Authentication vs authorization
- [ ] Password hashing with bcrypt — why not store plain text
- [ ] Session-based auth: cookies, session tokens, expiry
- [ ] Middleware pattern for protecting routes
- [ ] CORS and why credentials need special handling
- [ ] User-scoped data: `WHERE user_id = $N`
- [ ] Setup flow: first-user registration and invite system
- [ ] Rate limiting: per-endpoint, counting only failures
- [ ] TOTP 2FA and recovery codes
- [ ] Email verification flow
- [ ] Common vulnerabilities: CSRF, XSS, SQL injection

**Quiz:**
1. Why hash passwords with bcrypt instead of SHA-256?
2. What's the difference between a session cookie and a JWT?
3. Why must the auth middleware run before any protected handler?
4. In `ratelimit.go`, why only count failed attempts instead of all attempts?

---

### Lesson 13: End-to-End Encryption (E2EE)
**Goal:** Understand client-side encryption, key derivation, and zero-knowledge architecture
**Code to study:**
- `frontend/src/lib/crypto/keys.ts` — key derivation (PBKDF2), KEK/MEK wrapping (AES-KW)
- `frontend/src/lib/crypto/vault.ts` — encrypt/decrypt vault data (AES-GCM)
- `frontend/src/lib/crypto/vaultStore.svelte.ts` — reactive store coordinating crypto + API
- `backend/internal/vault/handler.go` — server stores opaque ciphertext
- `frontend/src/lib/budget/budgetEngine.ts` — operates on decrypted data client-side

**Topics:**
- [ ] Zero-knowledge architecture — server never sees plaintext
- [ ] Key hierarchy: Password → KEK (PBKDF2) → wraps MEK (AES-KW) → encrypts data (AES-GCM)
- [ ] PBKDF2 key derivation — why it's slow on purpose
- [ ] AES-GCM — authenticated encryption (confidentiality + integrity)
- [ ] AES-KW — key wrapping for storing encrypted keys
- [ ] Web Crypto API — browser-native cryptography
- [ ] Recovery keys — how admin password reset works without losing data
- [ ] Session persistence — caching MEK in sessionStorage
- [ ] The tradeoff: server can't help if user forgets password

**Quiz:**
1. Why derive the KEK from the password instead of using the password directly?
2. What does AES-GCM's "authenticated" mean — what attack does it prevent?
3. If the server is compromised, can the attacker read user data? Why or why not?
4. How does the recovery key allow admin password reset without knowing the user's password?

---

## Part 3: Feature-Linked Lessons (Learn by Building)

> New lessons are added here when you build new features. Each feature becomes a learning opportunity.

*No feature lessons yet — tell Claude "I want to build X" to add one!*

---

## Discussion Log

> Topics discussed, questions asked, key insights — updated by Claude after each session.

### Session History
*No sessions recorded yet.*

---

## Notes

- **Lesson order is flexible** — skip ahead if a topic excites you, go back if something's unclear
- **Each lesson takes ~30-60 min** depending on depth of discussion
- **You don't need to finish quizzes in one go** — come back anytime
- **The best learning happens when building** — after Part 1, consider alternating between lessons and feature work
