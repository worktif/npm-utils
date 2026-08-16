# AGENTS.md

## 0. Agent scope & identity

You are an AI coding agent working inside this repository only.

Your primary goals:
- Implement features and fixes as requested.
- Preserve existing architecture and public contracts.
- Maintain reliability, security, and performance.

You must:
- Prefer small, reviewable changes.
- Explain non-trivial decisions in comments or commit messages.
- Ask for clarification when a change would break explicit constraints below.

## 1. Project overview

**Purpose of this repo:**
- @worktif/utils is a TypeScript-first utility toolkit for enterprise Node.js, CLI, and AWS Lambda applications.
- Provides composable primitives for structured logging, lightweight dependency injection, method decorators, exception handling, and schema-friendly I/O.
- Published to npm as `@worktif/utils` under Apache 2.0.

**Core domains / bounded contexts:**
- Logger: Production-grade structured logging built on @aws-lambda-powertools/logger with custom formatters and serializers.
- DI Container: Lightweight dependency injection via PureContainer with factory and constant bindings.
- Decorators: Method decorators for pre/post injection, error interception, and request-scoped context.
- Exceptions: Custom exception classes with typed error surfaces.
- Serializers: API and GraphQL response serialization utilities.
- Config: Environment configuration with Zod schema validation.

**Critical invariants:**
- The `reflect-metadata` import must always be first in entry points when using decorators.
- Public API contracts (exported types, function signatures) must remain backwards compatible.
- Licensing headers (Apache 2.0) must be preserved in all source files.
- Logger sampling and level defaults are stage-aware and must not be altered without explicit instruction.

## 2. Environment & assumptions

**Runtime:**
- Node.js: >= 20.0.0
- TypeScript: 5.8.3

**Package manager:**
- yarn (stay consistent; do not mix with npm for dependency management).

**Local services:**
- None required. This is a library with no external service dependencies.

Do not assume internet access unless explicitly granted.

## 3. Setup & commands

Always use these commands when working with the project:

**Install dependencies:**
```bash
yarn install
```

**Run unit tests:**
```bash
yarn test
```

**Lint / format:**
- No dedicated lint command is currently configured in package.json.
- The CI pipeline references `yarn run eslint:lint` but this script is not present locally.

**Build:**
```bash
yarn build
```
This runs: docs generation → clean dist → build esbuild config → bundle with esbuild → generate type declarations → resolve path aliases.

**Generate documentation:**
```bash
yarn run docs        # Both markdown and HTML
yarn run docs:md     # Markdown only
yarn run docs:html   # HTML only
```

**Generate type declarations only:**
```bash
yarn run types
```

**Publish to npm:**
```bash
yarn run publish:npm
```

**Rule:** Before you propose final changes, run `yarn test` and `yarn build` to ensure tests pass and the project builds successfully.

## 4. Repository & architecture map

**High-level structure:**
```
src/                    — Core library source code
├── index.ts            — Main entry point (imports reflect-metadata, re-exports all modules)
├── bundle/             — Dependency injection container (PureContainer)
├── config/             — Environment configuration with Zod schemas
└── utils/              — Core utilities
    ├── common/         — Shared utilities (identity functions, ANSI helpers)
    ├── decorators/     — Method decorators (injectBefore, injectAfter, catchInjector)
    ├── di/             — DI utilities and types
    ├── exceptions/     — Custom exception classes
    ├── logger/         — Structured logging (logger factory, formatters, plugins)
    ├── serializer/     — Data serialization (API, GraphQL)
    └── structure/      — Interfaces (Lambda handler, logger)

bin/                    — Build tooling
└── esbuild/            — esbuild bundler configuration

docs/                   — Documentation configuration
├── app/                — Docs app source
└── docs.config/        — TypeDoc configuration files

dist/                   — Build output (gitignored)
├── bundle.js           — Bundled production code
└── src/                — Type declarations

.docs/                  — Generated documentation (markdown and HTML)
```

**Key entrypoints:**
- Library entry: `src/index.ts`
- Build config: `bin/esbuild/esbuild.config.ts`
- TypeDoc configs: `docs/docs.config/typedoc.md.json`, `docs/docs.config/typedoc.html.json`

## 5. Coding conventions

**Language:**
- TypeScript strict mode: true (do not weaken typings).
- Decorators enabled: `experimentalDecorators: true`, `emitDecoratorMetadata: true`.

**Style:**
- Quotes: single quotes preferred.
- Semicolons: required.
- Import order: `reflect-metadata` first at entry points, then external dependencies, then internal modules.
- Prefer pure functions where possible; side effects contained in logger emission and DI resolution.

**Path aliases:**
- `@core/bundle/*` → `src/bundle/*`
- `@core/config/*` → `src/config/*`
- `@utils/*` → `src/utils/*`

**File naming:**
- Implementation files: `<feature>.ts` (e.g., `logger.ts`, `bundle.ts`)
- Type definitions: `<feature>.types.ts`
- Utilities: `<feature>.utils.ts`
- Each directory has `index.ts` for barrel exports.

**Error handling:**
- Use `CustomException` for domain errors with typed error surfaces.
- Avoid throwing raw strings; always use Error instances or CustomException.

**Logging:**
- Use the library's own logger utilities.
- Do not log secrets, tokens, or PII.
- Structured logs with service name and action name for correlation.

**License headers:**
All source files must include the Apache 2.0 header:
```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors
```

## 6. Testing strategy

**When you change code:**
Always add or update tests covering:
- Happy path.
- Relevant edge cases.
- Regressions you are fixing.

**Test locations:**
- Unit tests: `src/**/*.test.ts` (co-located with source files)

**Commands:**
- Unit tests: `yarn test`

**Test configuration:**
- Jest with ts-jest preset.
- Test environment: node.
- Path aliases are mapped in `jest.config.js`.
- Test timeout: 30 seconds.
- Max workers: 2.

If tests fail, fix them or revert the change. Do not silence or delete failing tests without reason.

## 7. Workflow rules

**Branching:**
- Use branches like `feature/...`, `fix/...`.
- Release branches: `releases/v[version]-next-release-description`.

**Commits:**
- Keep commits small and focused.
- Examples:
  - `feat: add async serializer support to logger`
  - `fix: resolve DI circular dependency detection`
  - `chore: update TypeDoc configuration`

**Pull requests:**
- Title format: `[scope] short description`
- PR must include:
  - Summary of changes.
  - Risks and mitigations.
  - How to test (commands + steps).

## 8. Safety, secrets & destructive operations

**Never hardcode secrets, tokens, or passwords.**

**Do not read or modify:**
- `.env*` files, secret stores, or credentials in CI configs.
- `bitbucket-pipelines.yml` environment variables.

**Destructive operations are forbidden unless:**
- The user explicitly asks for such operations and confirms understanding of the risk.

**Do not add code that:**
- Sends production data to external services not already configured.
- Weakens authentication or authorization checks.
- Removes or bypasses licensing checks.

If you are unsure whether a change might be destructive, ask before proceeding.

## 9. Tooling & integrations

**Internal CLI:**
- No dedicated CLI tool. Build and publish via yarn scripts.

**Build tooling:**
- esbuild: Production bundling via `bin/esbuild/esbuild.config.ts`.
- tsc: Type declaration generation.
- tsc-alias: Path alias resolution in generated declarations.
- TypeDoc: Documentation generation (markdown and HTML).

**CI/CD:**
- Bitbucket Pipelines: Automated builds on develop, staging, and main branches.
- Pull request builds include ChatGPT code review integration.

Do not introduce new tools or services without a clear justification and minimal footprint.

## 10. Constraints / do-not-touch areas

**Do not change, unless a task explicitly requires it:**

**Public API contracts:**
- Exported function signatures from `src/index.ts`.
- Logger interface: `logger()`, `initLog()`, `LoggerLevel`.
- DI interface: `PureContainer.tie()`, `PureContainer.run()`, `PureContainer.tieConst()`.
- Decorator signatures: `injectBefore()`, `injectAfter()`, `catchInjector()`.
- Exception classes: `CustomException`.

**Shared types with external dependants:**
- `LoggerInstance`, `LoggerInterface`, `LambdaHandlerInterface`.
- `EntitySerializer`, `EntityLoggerSerializer`, `EntityLoggerSerializerMap`.

**Generated or vendor files:**
Do not manually edit:
- `dist/` (build output)
- `.docs/` (generated documentation)
- `yarn.lock` (unless the change is a direct result of dependency install)
- `bin/esbuild/dist/` (compiled esbuild config)

## 11. Performance & resource guidelines

**Performance-critical paths:**
- Logger hot paths: `initLog().now()` and `initLog().future()` must have minimal overhead.
- DI resolution: `PureContainer.run()` should avoid unnecessary allocations.
- Serializers: Should be zero-cost when not invoked.

**Constraints:**
- Avoid algorithms worse than O(n log n) for large collections unless justified.
- Be mindful of cold-start overhead in Lambda contexts.
- Level checks and identity fallbacks keep logging overhead negligible when disabled.

If a task touches performance-critical paths, summarize your reasoning and trade-offs.

## 12. Monorepo & nested AGENTS.md

This repository is not a monorepo. Nested AGENTS.md files are not currently used.

**Rule:** If nested AGENTS.md files are added in the future, follow the instructions of the closest AGENTS.md to the file you are editing.

Global constraints in this root file always apply for:
- Security.
- Secrets handling.
- Destructive operations.

## 13. Multi-agent / personas

If you are a specialized agent, follow your persona rules in addition to this file:

- **@dev-agent:** Focus on implementation and tests.
- **@test-agent:** Focus on test coverage and edge cases; do not change runtime code unless fixing flakiness.
- **@security-agent:** Focus on security review and hardening; minimize functional changes.

If rules conflict: **security > correctness > convenience**.

## 14. Definition of Done (checklist)

Before considering a task complete, ensure:

- [ ] Code compiles: `yarn build` succeeds.
- [ ] Tests pass: `yarn test` succeeds.
- [ ] No constraints from section 10 are violated.
- [ ] New/changed behavior is covered by tests.
- [ ] License headers are present in new source files.
- [ ] No secrets or sensitive data added to the repo.
- [ ] Changes are documented (changelog/docs/PR description).

If any item is not satisfied, the task is not done.
