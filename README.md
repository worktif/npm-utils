<h1 align="center">Target Utils — TypeScript Utilities for Node.js, CLI &amp; AWS Lambda</h1>

<p align="center">
  Composable, production-grade utilities for enterprise Node.js, CLI tools and AWS Lambda:
  structured logging, lightweight dependency injection, method decorators, typed exceptions,
  and schema-friendly I/O — engineered for low-latency paths, high observability and production safety.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@worktif/utils"><img src="https://img.shields.io/npm/v/@worktif/utils?style=for-the-badge&logo=npm&color=cb3837" alt="npm version"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=for-the-badge&logo=nodedotjs" alt="Node >=20"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/typescript-5.8%20strict-3178c6?style=for-the-badge&logo=typescript" alt="TypeScript strict"></a>
  <br>
  <a href="https://esbuild.github.io"><img src="https://img.shields.io/badge/build-esbuild-ffcf00?style=for-the-badge&logo=esbuild&logoColor=black" alt="Build esbuild"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=for-the-badge&logo=nodedotjs" alt="Platform"></a>
  <a href="https://docs.powertools.aws.dev/lambda/typescript/latest/"><img src="https://img.shields.io/badge/logging-AWS%20Powertools-ff9900?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS Lambda Powertools"></a>
  <a href="https://inversify.io"><img src="https://img.shields.io/badge/DI-Inversify-7c4dff?style=for-the-badge" alt="Inversify"></a>
  <a href="https://zod.dev"><img src="https://img.shields.io/badge/validation-Zod-3e67b1?style=for-the-badge&logo=zod" alt="Zod"></a>
  <br>
  <a href="#testing"><img src="https://img.shields.io/badge/tests-317%20passing-brightgreen?style=for-the-badge&logo=jest" alt="Tests"></a>
  <a href="#testing"><img src="https://img.shields.io/badge/e2e-24%20passing-brightgreen?style=for-the-badge&logo=jest" alt="E2E"></a>
  <a href="https://fast-check.dev"><img src="https://img.shields.io/badge/property--based-fast--check-8a2be2?style=for-the-badge" alt="Property-based testing"></a>
  <br>
  <a href="https://github.com/stdiobus/mcp-agentic/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=for-the-badge&logo=opensourceinitiative" alt="License"></a>
</p>

## Overview

`@worktif/utils` is a TypeScript-first utility toolkit for enterprise Node.js, CLI and AWS Lambda applications. It provides composable primitives for logging, dependency injection, decorators, exception handling, process/CLI ergonomics, and schema-friendly I/O — engineered for low-latency paths, high observability, and production safety.

The library emphasizes:
- Deterministic behavior under concurrency
- Explicit error semantics and structured logs
- Composability via a minimal DI core
- Zero-cost abstractions in hot paths

## Key Features

- Lightweight DI container (PureContainer)
  - Factory and constant bindings, explicit dependency graphs
  - Deterministic construction order and optional guarded arguments
- Decorators for orchestration
  - Pre/post injectors, safe error interception hooks
  - Request-scoped context injection (before-instance pattern)
- Exception utilities
  - Custom exceptions and typed error surfaces for predictable handling
- Production logger
  - Built on @aws-lambda-powertools/logger with custom formatter and serializers
  - Sync/async payload serialization, structured fields, level-aware emission
  - Stage-aware defaults and service name namespacing
- Common utilities
  - ANSI-safe CLI logs, identity helpers, safe object access, small functional helpers
- Cloud-native ergonomics
  - First-class Lambda readiness, zero-dependency bootstraps, environment-driven configuration

## Installation

```shell
npm install @worktif/utils
```

```shell
yarn add @worktif/utils
```


Peer requirements
- [Node.js](https://nodejs.org/en) >= 20
- [TypeScript 5.8.x](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html) recommended
- [reflect-metadata](https://www.npmjs.com/package/reflect-metadata) must be imported once at app entry
  - If using DI/decorators, enable `"emitDecoratorMetadata": true` and `"experimentalDecorators": true` in `tsconfig.json`

## Usage

## Logger: structured, serializer-aware logs

```typescript
import 'reflect-metadata';
import { logger, initLog, LoggerLevel } from '@worktif/utils';

// Configure a namespaced logger
const appLogger = logger({ serviceName: 'inventory/worker' });

async function main() {
  const log = await initLog(appLogger, 'ReconcileInventory', LoggerLevel.Info);

  // Log immediate payloads
  log.now({ sku: 'A-123', delta: 7 }, { tag: 'inventoryChange' });

  // Log future/async results with an async serializer
  const result = await log.future(
    Promise.resolve({ requestId: 'req-1', status: 'ok', items: 120 }),
    {
      serializer: async () => (payload: any) => ({
        ...payload,
        isoTime: new Date().toISOString(),
      }),
    },
  );

  // Typed log message with level override
  log.now(result, { level: LoggerLevel.Debug, tag: 'debugSnapshot' });
}

main().catch((e) => {
  appLogger.error('Unhandled exception', { error: e instanceof Error ? e.message : String(e) });
});
```

### Log Level – Configuration

The default log level is `INFO`. You can configure it in three ways (in order of priority):

1. **Programmatic** – pass `logLevel` to the logger config:
   ```typescript
   import { logger } from '@worktif/utils';

   const appLogger = logger({ serviceName: 'my-service', logLevel: 'DEBUG' });
   ```

2. **Environment variable** – set `LOG_LEVEL`:
   ```bash
   export LOG_LEVEL=DEBUG
   ```

3. **Default** – `INFO` if neither of the above is set

Valid log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`

#### Debug Logs for @worktif/utils

Internal DEBUG logs from @worktif/utils are suppressed by default (even if `logLevel` is `DEBUG`). To enable them, set:

```bash
export RUNTIME_DEBUG=true
```

#### Console Formatters

For local development, use human-readable console formatters instead of JSON:

```typescript
import { logger, RuntimeLoggerFormatter, RuntimeLogFormatterProvider } from '@worktif/utils';

// Compact single-line format
const compactLogger = logger({
  serviceName: 'my-service',
  logFormatter: new RuntimeLoggerFormatter({
    logsProvider: RuntimeLogFormatterProvider.CompactConsole,
  }),
});

// Rich multi-line format with metadata
const richLogger = logger({
  serviceName: 'my-service',
  logFormatter: new RuntimeLoggerFormatter({
    logsProvider: RuntimeLogFormatterProvider.RichConsole,
  }),
});

// AWS JSON format (default, for production/Lambda)
const awsLogger = logger({
  serviceName: 'my-service',
  logFormatter: new RuntimeLoggerFormatter({
    logsProvider: RuntimeLogFormatterProvider.Aws,
  }),
});
```

Output examples:

**CompactConsole:**
```
14:30:45.123 | INFO | my-service | User logged in {"userId":123,"method":"POST"}
```

**RichConsole:**
```
── INFO 14:30:45.123 | my-service
Message: User logged in
Meta:
  userId: 123
  method: POST
```

**Aws (JSON):**
```json
{"message":"\"User logged in\"","service":"my-service","logLevel":"INFO","timestamp":"2026-02-18T14:30:45.123Z",...}
```


### Dependency Injection: composable factories and constants

```typescript
import 'reflect-metadata';
import { PureContainer } from '@worktif/utils';

class ConfigService {
  constructor(public readonly env: string) {}
}

class MetricsService {
  constructor(public readonly config: ConfigService) {}
}

const container = new PureContainer();

// Factory bindings: `args` are passed to the constructor first, then resolved
// `dependencies` (by key). Here MetricsService receives a ConfigService instance.
container.tie({
  ConfigService: {
    instance: ConfigService,
    args: [{ value: process.env.STAGE ?? 'local' }],
    dependencies: [],
  },
  MetricsService: {
    instance: MetricsService,
    args: [],
    dependencies: ['ConfigService'],
  },
});

// Constants are bound separately and retrieved with `runConstant`
// (they are not resolved as factory dependencies).
container.tieConst({
  FeatureFlags: { instance: null, args: [{ value: { beta: true } }], dependencies: [] },
});

// `run` builds a fresh instance on each call (non-singleton by design).
const metrics = container.run<MetricsService>('MetricsService');
const flags = container.runConstant<{ beta: boolean }>('FeatureFlags');

console.log({ env: metrics.config.env, beta: flags.beta });
```


### Decorators: run logic before a method with safe error interception

```typescript
import 'reflect-metadata';
import { injectBefore, initLog, logger, LoggerLevel } from '@worktif/utils';
import type { BeforeInstance } from '@worktif/utils';

const appLogger = logger({ serviceName: 'orders/api' });

// Runs before the decorated method; the returned context is injected as the
// last argument, and uncaught errors are intercepted automatically.
async function beforeCreate(): Promise<BeforeInstance> {
  const log = await initLog(appLogger, 'CreateOrder', LoggerLevel.Info);
  return { typeDef: 'typedef_before_instance', log };
}

class OrderService {
  @injectBefore(beforeCreate)
  async create(input: { id: string }, before?: BeforeInstance): Promise<{ ok: boolean }> {
    before?.log.now({ step: 'persisted', id: input.id });
    return { ok: true };
  }
}

void new OrderService().create({ id: 'o-1' });
```


## API Reference

### Logger

- `logger(config?)`: Logger
  - `config.serviceName?: string` – appended to base service name to namespace logs
  - `config.logLevel?: LogLevel` – log level (`DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`). Priority: config > `LOG_LEVEL` env var > `INFO` default
  - `config.logFormatter?: LogFormatter` – custom powertools-compatible formatter (e.g., `RuntimeLoggerFormatter`)
  - Returns a configured Logger instance with stage-aware defaults:
    - `sampleRateValue: 1` in non-prod, 0.1 in prod

- `initLog(loggerInstance, actionName, logLevel?): Promise<LoggerInstance>`
  - `loggerInstance: Logger`
  - `actionName: string` – logical operation name for correlation
  - `logLevel?: LoggerLevel` – default Info
  - Returns `{ now, future }`
    - `now(payload, options?): payload | LogItemMessage`
      - `options.level?: LoggerLevel`
      - `options.tag?: string` – places payload under a structured field
      - `options.params?.serializer?: <T>(message: LogItemMessage) => T` – transforms final message
      - `options.serializer?: EntitySerializer | Promise<EntitySerializer>`
        - `EntitySerializer: (payload: any) => any` – runs before logging
    - `future(promise, options?): Promise<payload | LogItemMessage>`
      - `options.serializer` can be async-producing – `EntityLoggerSerializer`

- `LoggerLevel`
  - `Debug` | `Info` | `Warn` | `Error` | `Critical`

### DI – `PureContainer`

- `tie(options, ...args): void`
  - Registers factories under names. Each factory:
    - `instance`: new-able constructor
    - `args`: optional argument descriptors: `{ value, condition? }[]`
      - resolved as the first constructor arguments
    - `dependencies: string[]`
      - resolved instances are appended as subsequent constructor arguments
  - Deterministic factory resolution with explicit errors for invalid graphs

- `run(name, ...args): T`
  - Resolves and instantiates a factory each time (non-singleton by design)

- `runConstant(name): T`
  - Retrieves constant value

- `tieConst(options, ...args): void`
  - Binds immutable constants under names. Each option accepts:
    - `args: [{ value: any, condition?: (v) => any }]`
    - `dependencies: string[]` (not used for constants; for structure compatibility)
  - Example: `Env => 'prod'`, `FeatureFlags => { a: true }`

### Decorators

- `injectBefore(injectFn, injectCatchFn?): MethodDecorator`
  - `injectFn: (...args) => Promise<BeforeInstance>`
    - If `BeforeInstance` is found among args it is merged; otherwise appended
  - `injectCatchFn: (error, ...args) => any`
  - Ensures method receives a before-instance context; catches and reports errors

### Exceptions

- `CustomException` (subset)
  - `CustomException.InternalError(message, meta?)`
  - Throw typed errors for DI wiring or runtime faults with consistent messages

### Common types

- `Maybe<T> = T | undefined`
- Other default informatics types

### Serialization helpers

- `loggerSerializers: EntityLoggerSerializerMap`
  - `axios`: extracts response.data for convenient logging

#### Types

- `EntitySerializer: (payload: any) => any`
- `EntityLoggerSerializer: (logger: Logger | Console) => Promise<EntitySerializer>`
- `LoggerInstance: { now: (...), future: (...) }`
- `LoggerInstanceOptions` fields:
  - `level?: LoggerLevel` – per-call level override
  - `tag?: string` – nests the payload under a structured field
  - `params?: { serializer?: <T>(message) => T }` – transforms the final log message
  - `serializer?: EntitySerializer | Promise<EntitySerializer>` – runs before logging

## Use Cases

- High-volume Lambda handlers
  - Leverage sampling and level-aware logs to reduce noise in prod while preserving debug fidelity in lower stages
  - Async serializers to shape third-party responses (e.g., axios, GraphQL) before logging
- Regulated workloads (finance/health)
  - Explicit DI wiring yields predictable dependency graphs and repeatable construction paths
  - Structured logs with service/action names aid traceability and audit trails
- CLI and batch processors
  - ANSI-aware messages, stderr vs stdout separation, and deterministic exit handling
- Microservices with shared modules
  - Consistent exception and decorator patterns across services enable uniform observability and error surfaces

## Design Principles

- Functional core, imperative shell
  - Serializers and formatters are pure; side effects contained in logger emission
- Composability over inheritance
  - DI factories and constants as first-class primitives
- Observability-first
  - Structured events, stage-driven defaults, minimal branching per hot path
- Zero/low overhead in hot paths
  - Level checks and identity fallbacks keep logging overhead negligible when disabled
- Explicit wiring
  - Dependency graphs must be declared, preventing hidden coupling

---

## Testing

The suite is split into two Jest projects and is fully deterministic (no network, no machine-state dependencies).

```shell
# Unit + integration (run against src/)
yarn test

# With coverage gate (global + stricter DI-core thresholds)
yarn test:coverage

# Consumer-contract end-to-end (run against the built dist/ artifact)
yarn build && yarn test:e2e
```

- **Unit + integration** — 317 tests across 33 suites, including property-based tests via [`fast-check`](https://fast-check.dev) (≥100 runs each) that pin correctness invariants.
- **End-to-end / consumer-contract** — 24 tests that import the *built* package exactly as an external consumer would (`package.json` `main`/`types`), verifying public runtime exports, the type surface, and a Lambda-like scenario.
- **README contract** — every TypeScript example in this file is extracted verbatim and both compiled against `dist/src/index.d.ts` and executed against `dist/bundle.js`. If a snippet here does not compile and run, the build fails — so the examples above are guaranteed copy-paste runnable.

---

## Technical Notes &amp; Conventions

- All terminal output supports ANSI coloring and *explicit no-color* scenarios for portable CLI integration.
- Compatible with both ES module and CommonJS (`main` points to bundled dist file; types to declaration).
- Designed for cross-platform shell and cloud (primary focus: Unix-like environments).

---

## Contributing

This section is intended for external publishers responsible for releasing the package to npm. Follow the sequence precisely to ensure auditability, semantic versioning integrity, and a clean release trail.

- Authenticate to the scoped registry
  - `npm login --scope=@worktif`
  - If you encounter a TLS/registry error, set the registry explicitly:
    - `npm config set registry https://registry.npmjs.org/`
- Complete your enhancement
  - Implement and locally validate your changes (types, build, docs as applicable).
- Open a Pull Request (PR)
  - Submit your changes for review.
  - Await approval before proceeding.
- Merge the PR
  - After approval, merge into main using your standard merge policy.
- Synchronize your local main
  - `git checkout main`
  - `git pull` to ensure you’re up to date.
- Prepare a release branch
  - Create a branch using the release template:
    - `releases/v[your.semantic.version-[pre+[meta]]]-next-release-description`
- Bump the version
  - Update the package version according to SemVer (major/minor/patch).
- Commit the version bump to the release branch
  - Commit only the version change (and any generated artifacts if required by your policy).
- Push the release branch
  - Push the branch to the remote to trigger any CI gates.
- Open a Release PR
  - Create a PR from the release branch to main.
  - Await approval and required checks.
- Merge the Release PR
  - Merge into main after approvals and passing checks.
- Final synchronization
  - Pull the latest changes from main locally.
- Validate the version in package.json
  - Ensure the version reflects the intended release.
- Publish
  - If the version was not increased (npm will reject):
    - Bump the version, commit, and then run yarn run publish:npm.
  - If the version has been increased and publishing fails unexpectedly:
    - Contact the maintainer at raman@worktif.com with context (command output, Node/npm versions, CI logs).

Successful publish output resembles:
```shell
+ @worktif/utils@[your.semantic.version-[pre+[meta]]]
✨  Done in 28.81s.
```

Security and responsible disclosure
- Do not include secrets in tests or examples
- Report vulnerabilities privately to the maintainers contact below


## Maintainers / Contact

- Maintainer: Raman Marozau, [raman@worktif.com](mailto:raman@worktif.com)
- Documentation and support: `docs/` generated via TypeDoc

If you have production questions, provide:
- Package version, Node version, runtime (local/Lambda/container)
- Minimal reproduction (if applicable)
- Redacted logs with service name and action name for correlation

## License

Apache-2.0
