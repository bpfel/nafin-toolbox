# Test Plan — nafin-toolbox (E2EE branch)

## 1. Automated Unit Tests

### Backend (Go) — 204 passing

| Package | Test File | What It Tests | Count |
|---------|-----------|---------------|-------|
| auth | `password_test.go` | Bcrypt hashing, password validation | 4 |
| auth | `crypto_test.go` | AES-GCM encrypt/decrypt of TOTP secrets | 5 |
| auth | `ratelimit_test.go` | Sliding-window rate limiter: Allow, Check, RecordFailure, concurrency, trusted proxies | 21 |
| auth | `middleware_test.go` | RequireAuth (no cookie), UserFromContext, ContextWithUser | 5 |
| auth | `handler_test.go` | Handler input validation (login, invite, 2FA, password change, admin ops), UserFromContext | 48 |
| vault | `handler_test.go` | All 6 vault HTTP handlers via VaultStorer mock: GET/PUT vault, GET/POST/PUT keys, POST recovery, auth enforcement, size limits, bcrypt verification | 41 |
| module | `module_test.go` | KnownModules map, constants, NetWorthContributor interface | 8 |
| module | `handler_test.go` | enableRequest JSON decoding, enable/disable handlers, auth enforcement | 21 |
| email | `templates_test.go` | Invite email HTML+text rendering, XSS prevention, URL construction, edge cases | 14 |
| email | `smtp_test.go` | LogSender (always succeeds), NewSMTPSender config parsing, port defaults | 17 |
| database | `migrate_test.go` | listMigrationFiles: sorting, filtering, empty dir, non-SQL files, special chars | 9 |
| server | `server_test.go` | getAllowedOrigins, originCheck CSRF, securityHeaders, maxBodySize boundaries | 27 |

### Frontend (TypeScript/Vitest) — all passing

| Module | Test File | What It Tests | Count |
|--------|-----------|---------------|-------|
| crypto | `keys.test.ts` | deriveKEK (consistency, different inputs, email normalization, unicode), generateMEK, wrapMEK/unwrapMEK round-trips, generateRecoveryKey format, wrapMEKWithRecovery/unwrapMEKWithRecovery, case sensitivity | 43 |
| crypto | `vault.test.ts` | createEmptyVault, encryptVault/decryptVault round-trips, data preservation (amounts, booleans, unicode, sort order), wrong-key rejection, corrupted-data detection, large vault stress test | 22 |
| api | `client.test.ts` | All 14 API functions (fetchModules, enableModule, disableModule, healthCheck, fetchVaultKeys, setupVaultKeys, updateVaultKeys, recoverVaultKeys, fetchVault, putVault, etc.), error handling (network, 400/401/404/500), 401 callback | 55 |
| budget | `budgetEngine.test.ts` | All 17 budget functions: groups CRUD, categories CRUD + reorder, periods CRUD + copy, entries upsert/delete, getPeriodSummary, seedDefaults, cascade delete, sortOrder auto-increment | 106 |
| auth | `VerifyEmailPage.test.ts` | Email verification page rendering | 1 |

**Total automated: ~431 tests** (204 backend + 227 frontend)

---

## 2. Automated Integration Tests (require running DB)

| Package | Test File | What It Tests | Prerequisites |
|---------|-----------|---------------|---------------|
| auth | `store_integration_test.go` | Full user CRUD, sessions, verification tokens, TOTP secrets, recovery codes, MFA challenges, app settings, audit log, cascade deletes (37 tests) | `DATABASE_URL` env var pointing to Postgres |

**How to run:** `docker compose run --rm api sh -c "DATABASE_URL=... go test ./internal/auth/ -run Integration -v"`

---

## 3. Automated Tests — NOT YET WRITTEN

### Backend integration tests needed

| Area | Endpoints / Functions | Why Not Automated |
|------|----------------------|-------------------|
| Auth handlers (full flow) | POST /auth/login, POST /auth/logout, POST /auth/setup, GET /auth/needs-setup | Require DB + session cookie handling |
| Auth invite flow | POST /auth/invite, POST /auth/verify-email, POST /auth/resend-verification | Require DB + SMTP mock |
| Auth 2FA flow | POST /auth/2fa/setup, POST /auth/2fa/confirm, POST /auth/2fa/verify, DELETE /auth/2fa, POST /auth/2fa/recovery-codes | Require DB + TOTP_KEY env |
| Auth password flow | POST /auth/change-password, POST /auth/users/{id}/reset-password | Require DB + bcrypt |
| Auth admin ops | GET /auth/users, DELETE /auth/users/{id}, POST /auth/settings/require-2fa | Require DB + admin session |
| Auth audit log | GET /auth/audit-logs | Require DB with test data + pagination |
| Auth store cleanup | DeleteExpiredSessions, DeleteExpiredVerificationTokens, DeleteExpiredMFAChallenges | Require DB with expired test data |
| Vault store | GetVault, PutVault, GetEncryptedMEK, SetEncryptedMEK, UpdateEncryptedMEK, GetRecoveryData | Require DB with vault migration |
| Module handlers | GET/POST/DELETE /api/modules | Require DB with modules table |
| Server startup | ListenAndServe, handleHealth | Require full server process |

### Frontend component tests needed

| Component | Location | Key Behaviors to Test |
|-----------|----------|----------------------|
| App.svelte | `src/App.svelte` | Routing between modules, auth gating, vault lock screen, admin skip-vault, module picker modal |
| LoginPage.svelte | `src/lib/auth/LoginPage.svelte` | Login form submission, setup mode, 2FA prompt, error display, loading states |
| SecuritySettings.svelte | `src/lib/auth/SecuritySettings.svelte` | 2FA enable/disable toggle, recovery codes display, change password navigation, admin audit log |
| TwoFactorSetup.svelte | `src/lib/auth/TwoFactorSetup.svelte` | QR code display, manual entry, code verification, recovery codes copy/download |
| TOTPInput.svelte | `src/lib/auth/TOTPInput.svelte` | 6-digit numeric input, auto-submit on complete, recovery code mode (8 digits) |
| ChangePasswordForm.svelte | `src/lib/auth/ChangePasswordForm.svelte` | Form validation, mismatch detection, API error display, optional logout button |
| InvitePanel.svelte | `src/lib/auth/InvitePanel.svelte` | User list with badges, invite form, resend verification, reset password (2-step), delete user |
| AuditLogViewer.svelte | `src/lib/auth/AuditLogViewer.svelte` | Event/user filters, pagination, metadata expand/collapse, event badge colors |
| authStore.svelte.ts | `src/lib/auth/authStore.svelte.ts` | Reactive state: login/logout, checkAuth, vault init skip for admin, 2FA flow, must_change_password |
| vaultStore.svelte.ts | `src/lib/crypto/vaultStore.svelte.ts` | Vault lock/unlock, auto-save on changes, recovery flow, encryption orchestration |
| BudgetModule.svelte | `src/modules/budget/BudgetModule.svelte` | Auto-period creation, loading state, integration with BudgetTable/Summary |
| BudgetSetup.svelte | `src/modules/budget/BudgetSetup.svelte` | Seed defaults vs start blank, setup completion callback |
| BudgetSummary.svelte | `src/modules/budget/BudgetSummary.svelte` | Income/expense/savings display, Swiss number formatting (CHF 1'234.56) |
| BudgetTable.svelte | `src/modules/budget/BudgetTable.svelte` | Category groups, collapse/expand, add/delete category modals, entry editing |
| BudgetEntryRow.svelte | `src/modules/budget/BudgetEntryRow.svelte` | Planned/actual inputs, yearly toggle, fixed category display, mobile long-press delete |
| MonthSelector.svelte | `src/modules/budget/MonthSelector.svelte` | Month navigation, year rollover, prev/next buttons |
| AddCategoryModal.svelte | `src/modules/budget/AddCategoryModal.svelte` | Group selection, category name input, create vs edit mode |
| DeleteCategoryModal.svelte | `src/modules/budget/DeleteCategoryModal.svelte` | Confirmation dialog, backdrop click, keyboard dismiss |

---

## 4. Manual Tests

### 4.1 First-Time Setup

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M1 | Fresh deploy | `docker compose down -v && docker compose up -d --build` | All 4 containers healthy (db, api, frontend, mailpit) |
| M2 | Setup screen | Open http://localhost:3000 | "Create Admin Account" form shown (no other UI) |
| M3 | Create admin | Fill email + password (8+ chars), submit | Logged in, no vault setup screen (admin skips E2EE), module picker shown |
| M4 | Setup only once | Open incognito, visit http://localhost:3000 | Login form shown (not setup form) |

### 4.2 Authentication

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M5 | Login success | Enter admin credentials | Redirected to app, session cookie set |
| M6 | Login failure | Enter wrong password | "Invalid credentials" error, no redirect |
| M7 | Rate limiting | Enter wrong password 5 times in 1 minute | "Too many attempts" error on 6th try |
| M8 | Logout | Click user menu > Logout | Returned to login screen, session cookie cleared |
| M9 | Session persistence | Login, close tab, reopen http://localhost:3000 | Still logged in (session cookie valid) |
| M10 | Expired session | Wait for session to expire (or delete cookie) | Redirected to login on next API call |

### 4.3 User Management (Admin)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M11 | Invite user | Security > Users > enter email + role > Invite | Success message, verification email in Mailpit (http://localhost:8025) |
| M12 | Verify email | Click link in Mailpit email | User lands on password-set screen, email marked verified |
| M13 | Resend verification | Click "Resend" on unverified user row | New email in Mailpit |
| M14 | Reset password | Click "Reset PW" > Confirm on verified user | Temp password shown, user forced to change on next login |
| M15 | Password change after reset | Login as reset user with temp password | "Change Password" screen shown with logout button, can set new password |
| M16 | Delete user | Click "Delete" on non-self user | User removed from list, their sessions invalidated |
| M17 | Cannot delete self | Admin's own row | No "Delete" button shown |

### 4.4 Two-Factor Authentication

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M18 | Enable 2FA | Security > Enable 2FA > scan QR with authenticator app > enter code | 2FA enabled, recovery codes shown |
| M19 | Login with 2FA | Logout and login again | Prompted for TOTP code after password |
| M20 | TOTP code entry | Enter 6-digit code from authenticator | Login succeeds |
| M21 | Wrong TOTP code | Enter incorrect code | "Invalid code" error |
| M22 | Recovery code | Use one of the recovery codes instead of TOTP | Login succeeds, code consumed |
| M23 | Used recovery code | Try same recovery code again | Fails (already consumed) |
| M24 | Regenerate recovery codes | Security > Regenerate Recovery Codes | New set of codes shown, old codes invalidated |
| M25 | Disable 2FA | Security > Disable 2FA > enter password | 2FA removed, next login only needs password |

### 4.5 E2EE Vault (Regular User)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M26 | Vault setup | Login as new regular user for first time | Recovery key screen shown, vault initialized |
| M27 | Recovery key display | After vault setup | Recovery key displayed in XXXX-XXXX format, can copy/save |
| M28 | Vault unlock on login | Logout and login again | Vault decrypts automatically with password (no extra prompt) |
| M29 | Vault after password change | Change password via Security settings | Vault re-encrypted with new KEK, still accessible |
| M30 | Vault recovery | After admin password reset, login with temp password, change password | Vault decrypt fails > recovery key prompt > enter recovery key > vault restored |
| M31 | Wrong recovery key | Enter incorrect recovery key | "Invalid recovery key" error |
| M32 | Admin has no vault | Login as admin | No vault setup, no recovery key, no lock screen |

### 4.6 Budget Module

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M33 | Enable budget | Module picker > enable Budget | Budget module appears in sidebar |
| M34 | Budget setup | Click "Seed Defaults" or "Start Blank" | Categories created (or empty), first period created for current month |
| M35 | Add category | Click "+" > fill name > select group > save | Category appears in correct group |
| M36 | Edit budget entry | Click on a planned/actual cell > type amount > Tab/Enter | Value saved, summary updates |
| M37 | Month navigation | Click next/previous month | New month's entries shown (or created) |
| M38 | Copy from previous | Navigate to new empty month | Entries copied from previous month (planned values) |
| M39 | Delete category | Right-click or long-press category > confirm delete | Category and its entries removed |
| M40 | Budget summary | Enter income and expense values | Summary shows correct totals (income - expenses = savings) |
| M41 | Swiss formatting | Enter large numbers | Displayed as CHF 1'234.56 with apostrophe thousands separator |
| M42 | Disable budget | Settings > Modules > disable Budget | Budget removed from sidebar, data preserved in DB |

### 4.7 Cross-Cutting Concerns

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M43 | Mobile responsive | Open on phone-width viewport (375px) | Hamburger menu, collapsible tables, touch-friendly buttons (44px+ targets) |
| M44 | Concurrent sessions | Login in two browsers | Both sessions work independently |
| M45 | CORS protection | curl with wrong Origin header to POST endpoint | Request blocked (403 or no CORS headers) |
| M46 | Large vault | Create ~100 budget categories with entries across 12 months | Vault saves/loads without timeout or size error |
| M47 | Docker restart | `docker compose restart` | All services recover, data persisted, sessions valid |
| M48 | Database migration | Start fresh DB, check `schema_migrations` table | All migrations applied in order |

### 4.8 Security

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| M49 | XSS in category names | Create category with name `<script>alert(1)</script>` | Script not executed, text displayed escaped |
| M50 | SQL injection | Attempt `'; DROP TABLE users; --` in email field | Error returned, no data loss |
| M51 | CSRF | POST to /api/auth/login from different origin | Blocked by origin check middleware |
| M52 | Session cookie flags | Inspect session cookie in browser | HttpOnly=true, SameSite=Lax, Secure=true (in production) |
| M53 | Password stored hashed | Check `users` table directly | Password column contains bcrypt hash, not plaintext |
| M54 | Vault data encrypted | Check `user_vaults` table directly | ciphertext column is opaque binary, not readable JSON |
| M55 | Recovery key stored hashed | Check `users.recovery_key_hash` column | Contains bcrypt hash, not plaintext recovery key |
| M56 | Rate limit reset | Wait for rate limit window to expire (1 min) | Login attempts allowed again |
| M57 | Audit log records | Perform login, password change, 2FA toggle | Events appear in audit log with correct IP, timestamp, event type |

---

## 5. Test Execution Quick Reference

### Run all backend tests (no DB required)
```bash
cd /home/bpfel/nafin-toolbox-e2ee/backend
docker run --rm -v "$(pwd)":/app -w /app golang:1.23-alpine \
  sh -c "go test ./... -count=1 -timeout=60s"
```

### Run backend integration tests (DB required)
```bash
docker compose run --rm api sh -c \
  "DATABASE_URL='postgres://finance:finance@db:5432/finance?sslmode=disable' \
   go test ./internal/auth/ -run Integration -v -timeout=120s"
```

### Run all frontend tests
```bash
cd /home/bpfel/nafin-toolbox-e2ee/frontend
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine \
  sh -c "npm ci --silent && npx vitest run"
```

### Run specific frontend test file
```bash
npx vitest run src/lib/crypto/keys.test.ts
```

### Fresh deploy for manual testing
```bash
docker compose down -v && docker compose up -d --build
# Frontend: http://localhost:3000
# Mailpit:  http://localhost:8025
# API:      http://localhost:8081
```
