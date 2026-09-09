# Website Authentication and Download Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the isolated vanilla website from `production` on Cloudflare Pages and add popup Supabase authentication plus per-user GitHub Release download tracking.

**Architecture:** The browser uses Supabase Auth and RLS directly; no custom backend or private installer storage is added. Pure presentation/data helpers remain separately testable, Supabase SQL owns authorization, and GitHub Releases remain the download source.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Supabase Auth/Postgres/RLS, Cloudflare Pages, Turnstile, Brevo SMTP, GitHub Actions/Releases, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-website-auth-download-tracking-design.md`

## Global Constraints

- Keep the Electron editor offline and telemetry-free.
- Add no frontend framework or runtime backend.
- Commit no SMTP, service-role, Turnstile secret, or other private credential.
- Keep installers public in GitHub Releases; login provides UI gating and analytics only.
- `package.json` remains the sole application-version authority.
- Cloudflare production deploys come only from `production`.

---

### Task 1: Isolated website and testable release helpers

**Files:**
- Create: `live-website/public/index.html`
- Create: `live-website/public/assets/site-core.js`
- Create: `scripts/liveWebsite.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeEmailDomain(email): string`, `isAllowedEmail(email): boolean`, `selectReleaseAssets(release): { version, windows, macos, linux }`, and `authViewFromUrl(url): string | null`.

- [ ] **Step 1: Write failing helper tests** covering exact domain matching, supported GitHub asset suffixes, missing assets, and `auth=verified|recovery` URL states.
- [ ] **Step 2: Run `node scripts/liveWebsite.test.mjs`** and verify the missing module failure.
- [ ] **Step 3: Implement the pure helpers** with an immutable allowed-domain set and case-insensitive asset matching.
- [ ] **Step 4: Copy the current landing page into `live-website/public/index.html`**, correct image paths, and load the website modules without changing the legacy `docs/index.html`.
- [ ] **Step 5: Add `test:website` to `package.json`** and run it to green.

### Task 2: Accessible authentication/download modal

**Files:**
- Create: `live-website/public/assets/config.js`
- Create: `live-website/public/assets/auth.css`
- Create: `live-website/public/assets/auth.js`
- Modify: `live-website/public/index.html`
- Modify: `scripts/liveWebsite.test.mjs`

**Interfaces:**
- Consumes: Task 1 helpers and all `.js-dl-win`, `.js-dl-mac`, `.js-dl-linux` elements.
- Produces: `openAuthModal(view, platform?)`, `closeAuthModal()`, and modal states `signup`, `login`, `check-email`, `forgot`, `recovery`, `download`, `error`.

- [ ] **Step 1: Extend tests** for download-button intent and safe event payload creation.
- [ ] **Step 2: Run `npm run test:website`** and verify the new assertions fail.
- [ ] **Step 3: Add public configuration** using empty-string defaults that disable auth submission and show setup guidance.
- [ ] **Step 4: Add concise modal markup and CSS** with dialog semantics, labelled forms, focus containment, Escape/overlay close, pending states, and responsive sizing.
- [ ] **Step 5: Implement Supabase browser authentication** for signup metadata, login, logout, persistent sessions, resend confirmation, forgotten password, and recovery password update.
- [ ] **Step 6: Integrate Turnstile** and pass its token to Supabase Auth calls; reset the widget after each attempt.
- [ ] **Step 7: Replace direct download behavior** so signed-out clicks open signup, header login opens login, and signed-in clicks record `{ user_id, platform, version }` before downloading; tracking failure must not block navigation.
- [ ] **Step 8: Update website privacy copy** to state that website accounts and download clicks are collected while the desktop editor remains telemetry-free.
- [ ] **Step 9: Run helper tests and validate HTML module paths.**

### Task 3: Supabase security schema

**Files:**
- Create: `live-website/supabase/schema.sql`
- Create: `live-website/supabase/schema.test.sql`

**Interfaces:**
- Produces: `public.profiles`, `public.download_events`, `public.handle_new_user()`, and `public.hook_restrict_signup_by_email_domain(event jsonb)`.

- [ ] **Step 1: Write SQL assertions** for table existence, enabled RLS, policy ownership checks, and allowed/rejected domains.
- [ ] **Step 2: Implement tables and constraints** including cascade deletion, platform checks, timestamps, and minimal grants.
- [ ] **Step 3: Implement profile trigger** using signup `full_name` metadata.
- [ ] **Step 4: Implement RLS** so users read only their profile and insert only their own download events; anonymous access and event enumeration remain denied.
- [ ] **Step 5: Implement the Before User Created hook** with exact normalized domains: `gmail.com`, `googlemail.com`, `yahoo.com`, `yahoo.co.in`, `ymail.com`, `outlook.com`, `hotmail.com`, `live.com`, `proton.me`, `protonmail.com`, and `pm.me`.
- [ ] **Step 6: Run the SQL assertions** against a local or test Supabase project when credentials are available; otherwise syntax-check and document the required dashboard verification.

### Task 4: Production branch and release safeguards

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Create: `scripts/verify-release.mjs`
- Modify: `scripts/liveWebsite.test.mjs`

**Interfaces:**
- Produces: `node scripts/verify-release.mjs <tag>` and CI gates for `main`, `production`, and PRs targeting `production`.

- [ ] **Step 1: Test release-version validation** for matching and mismatching `vX.Y.Z` tags.
- [ ] **Step 2: Implement the verifier** against `package.json` with actionable errors.
- [ ] **Step 3: Add fast CI** running install, website tests, subtitle tests, and the application build on pushes to `main`/`production` and PRs to `production`.
- [ ] **Step 4: Add a release verification job** that checks the tag version and confirms the tagged commit is contained in `origin/production`; make packaging depend on it.
- [ ] **Step 5: Run local version tests and inspect workflow syntax.**

### Task 5: Deployment and provider setup guide

**Files:**
- Create: `live-website/README.md`
- Modify: `docs/README.md`

**Interfaces:**
- Documents the exact owner-only setup for Supabase, Brevo, Turnstile, Cloudflare Pages, GitHub branch protection, and release tagging.

- [ ] **Step 1: Document Supabase setup**: run schema, enable hook, confirm email, set redirect URLs, enable Turnstile, configure Brevo SMTP, and disable email link tracking.
- [ ] **Step 2: Document Cloudflare setup**: Git integration, root `live-website`, output `public`, production branch `production`, and disabled preview branches.
- [ ] **Step 3: Document release procedure**: update `package.json`, merge `main` to protected `production`, tag the production commit, push tag, and verify assets/download counts.
- [ ] **Step 4: Document zero-cost boundaries and public-release bypass limitation.**

### Task 6: Final verification

**Files:**
- Verify all files above without changing unrelated editor code or `docs/index.html`.

- [ ] **Step 1: Run `npm run test:website`.** Expected: all website tests pass.
- [ ] **Step 2: Run `npm run test:subtitle`.** Expected: all subtitle tests pass.
- [ ] **Step 3: Run `npm run build`.** Expected: Electron production build succeeds.
- [ ] **Step 4: Run `git diff --check` and inspect `git status --short`.** Expected: no whitespace errors and only intended files plus the preserved user edit.
- [ ] **Step 5: Review authentication secrets and URLs.** Expected: only public empty configuration values are committed.
