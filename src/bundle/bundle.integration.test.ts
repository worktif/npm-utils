// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { withEnv, isolatedImport, captureConsole } from '../../test/test-harness';

import type { PureContainer as PureContainerClass } from './pure.container';
import type { EnvConfigDefault as EnvConfigDefaultClass } from '@core/config/env.config.default';
import type { LoggerCliPlugin as LoggerCliPluginClass } from '@utils/logger/plugins/plugin.cli/logger.cli.plugin';
import type { LoggerCliPluginExt as LoggerCliPluginExtClass } from '@utils/logger/plugins/plugin.cli/logger.cli.plugin.ext';
import type { ApiSerializer as ApiSerializerClass } from '@utils/serializer/services.serializer/api.services/api.serializer';
import type { Serializer as SerializerClass } from '@utils/serializer/serializer';
import type { RuntimeLoggerFormatter as RuntimeLoggerFormatterClass } from '@utils/logger';

/**
 * TEST-ONLY WORKAROUND for the characterized barrel-cycle defect (pinned deterministically
 * in `bundle.barrel-cycle.known-bug.test.ts`; consistent with the same mock used by the
 * lifecycle and known-bug locks in tasks 2.7 / 2.9). NO production source is modified.
 *
 * Why it is unavoidable here (verified empirically): composing the REAL logger subsystem
 * requires `@utils/logger`, whose `logger.utils.ts` imports the `@core/bundle` barrel
 * (`import { bundle } from '../../bundle'`). That evaluates `bundle.ts`, which imports
 * `{ ApiSerializer, Serializer }` from the `@utils/serializer` TOP BARREL. Under
 * ts-jest/CommonJS the top barrel then evaluates `graphql.serializer.ts`, whose
 * `class GraphqlSerializer extends ApiSerializer` reads `ApiSerializer` off the
 * still-initializing barrel and resolves it to `undefined`
 * (`TypeError: Class extends value undefined`). In production esbuild flattens every module
 * into one hoisted scope, so the edge is satisfied; only per-module CommonJS trips it.
 *
 * Why the mock keeps the integration GENUINE (smallest possible surface): it substitutes
 * ONLY the `@utils/serializer` top barrel — the single module read by `bundle.ts` and
 * `graphql.serializer.ts`, neither of which is exercised by the assertions. The subsystems
 * under integration are imported from their CONCRETE module paths
 * (`.../api.services/api.serializer`, `.../serializer`, `@core/config/env.config.default`,
 * the `plugin.cli` concrete files, `@utils/logger`'s `RuntimeLoggerFormatter`) and are the
 * REAL production classes wired through the REAL `PureContainer` (real Inversify). The
 * `bundle` constant created on `bundle.ts` load is incidental transitive baggage and is
 * never referenced.
 *
 * Intended future behavior (flip when fixed): break the barrel cycle at the source — have
 * `graphql.serializer.ts` import `ApiSerializer` from its concrete path rather than the
 * top barrel — after which this mock becomes unnecessary.
 */
jest.mock('@utils/serializer', () => ({
  /** Stub standing in for the real `ApiSerializer`; only consumed by unexercised barrel edges. */
  ApiSerializer: class ApiSerializer { },
  /** Stub standing in for the real `Serializer`; only consumed by unexercised barrel edges. */
  Serializer: class Serializer { },
}));

/**
 * Task 2.10 — DI-core INTEGRATION test against the REAL subsystem graph (Requirement 1.3).
 *
 * Scope (distinct from the unit tests): this exercises REAL in-repo subsystems wired
 * together through the REAL dependency-injection mechanism — the production
 * `PureContainer` (real Inversify) — under a controlled `process.env` (`withEnv`) and an
 * isolated module registry (`isolatedImport`). The classes composed are the genuine
 * production classes, NOT fakes:
 *
 *   - `EnvConfigDefault`   (config subsystem)   — real Zod-validated env parsing
 *   - `LoggerCliPluginExt` (logger subsystem)   — real CLI logger extension
 *   - `LoggerCliPlugin`    (logger subsystem)   — real CLI logger, depends on env + ext
 *   - `ApiSerializer`      (serializer subsystem)
 *   - `Serializer`         (serializer subsystem) — depends on `ApiSerializer`
 *   - `RuntimeLoggerFormatter` x3 (logger formatters: local / local-shortened / aws)
 *
 * The binding graph below MIRRORS the production `Bundle.injectContainer()` wiring exactly
 * (same DI keys, same `instance`/`args`/`dependencies` shape, same declaration order), so
 * the integration faithfully reproduces how `Bundle` composes the real graph — without
 * importing `bundle.ts` itself (see the barrel-cycle note below).
 *
 * Why we do NOT import the production `bundle.ts` here:
 *   `bundle.ts` imports `{ ApiSerializer, Serializer }` from the `@utils/serializer` BARREL,
 *   and its top-level `export const bundle = new Bundle()` would (a) trip the characterized
 *   barrel-cycle defect (`Class extends value undefined`, pinned in
 *   `bundle.barrel-cycle.known-bug.test.ts`) under ts-jest/CommonJS, and (b) force a mock of
 *   the very serializer subsystem we want to keep REAL. Instead we import each subsystem from
 *   its CONCRETE module path and wire it through the REAL `PureContainer`, reproducing the
 *   production binding shape while keeping every subsystem genuine. No production source is
 *   modified.
 *
 * Determinism / isolation (Requirements 2.1, 2.2): the graph is constructed inside
 * `withEnv({...valid env...}, () => isolatedImport(() => ...))` so (a) `process.env` is
 * snapshotted, overridden, and restored around the run, and (b) each construction happens in
 * a fresh module registry, containing any module-load side effect (e.g. `EnvConfigDefault`'s
 * `dotenv` import) and the per-run construction semantics of the container.
 *
 * Requirements: 1.3.
 */

/**
 * DI keys mirrored from `Di` (`src/utils/di/di.types.ts`). They are pinned as string
 * literals — exactly the production enum values — so the binding map is robust under
 * ts-jest `isolatedModules` (a `const enum` has no runtime object to import across modules).
 */
const DI = {
  EnvConfigDefaultBind: 'env_config_default_bind',
  ApiSerializerBind: 'api_serializer_bind',
  SerializerFactoryBind: 'serializer_factory_bind',
  LoggerCli_plugin: 'loggerCli_plugin',
  LoggerCli_plugin_ext: 'loggerCli_plugin_ext',
  LoggerRuntimeFormatter_Local: 'logger_runtime_formatter_local_factory_bind',
  LoggerRuntimeFormatter_Local_Shortened:
    'logger_runtime_formatter_local_shortened_factory_bind',
  LoggerRuntimeFormatter_Aws: 'logger_runtime_formatter_aws_factory_bind',
} as const;

/**
 * A controlled, fully-valid environment for the config subsystem. `STAGE`/`PROVIDER` flow
 * into `EnvConfigDefault.bundle`; the AWS keys satisfy the default (non-support) schema so
 * the real Zod validation passes deterministically without leaning on developer machine
 * state or a local `.env` (Requirement 2.5).
 */
const VALID_ENV: Readonly<Record<string, string | undefined>> = {
  STAGE: 'prod',
  PROVIDER: 'integration-suite',
  DEBUG: 'false',
  AWS_REGION: 'eu-west-1',
  AWS_ACCESS_KEY_ID: 'AKIA-INTEGRATION-TEST',
  AWS_SECRET_ACCESS_KEY: 'integration-test-secret',
  AWS_SESSION_TOKEN: 'integration-test-session',
};

/**
 * The real subsystem instances resolved from the composed graph, plus the class references
 * from the SAME isolated module evaluation (so `instanceof` checks compare identical realm
 * constructors).
 */
interface ComposedGraph {
  container: PureContainerClass;
  env: EnvConfigDefaultClass;
  loggerPluginExt: LoggerCliPluginExtClass;
  loggerPlugin: LoggerCliPluginClass;
  apiSerializer: ApiSerializerClass;
  serializer: SerializerClass;
  formatterLocal: RuntimeLoggerFormatterClass;
  formatterLocalShortened: RuntimeLoggerFormatterClass;
  formatterAws: RuntimeLoggerFormatterClass;
  classes: {
    PureContainer: typeof PureContainerClass;
    EnvConfigDefault: typeof EnvConfigDefaultClass;
    LoggerCliPlugin: typeof LoggerCliPluginClass;
    LoggerCliPluginExt: typeof LoggerCliPluginExtClass;
    ApiSerializer: typeof ApiSerializerClass;
    Serializer: typeof SerializerClass;
    RuntimeLoggerFormatter: typeof RuntimeLoggerFormatterClass;
  };
}

/**
 * Builds and resolves the REAL subsystem graph through the REAL `PureContainer`, mirroring
 * `Bundle.injectContainer()` binding-for-binding. Runs inside a fresh module registry
 * (`isolatedImport`) so module-load side effects are contained; the caller wraps this in
 * `withEnv` so the env in force during construction is the controlled, valid one.
 *
 * Console is captured for the duration so the real logger's asynchronous initialization does
 * not pollute the test reporter; records are discarded (the assertions target composition,
 * not log content — that is covered by the logger phase).
 */
const composeRealGraph = (): ComposedGraph =>
  isolatedImport(() => {
    const consoleRecords = captureConsole();
    try {
      // Concrete module paths (NOT the `@utils/serializer` barrel) keep every subsystem real
      // while side-stepping the characterized barrel-cycle defect.
      //
      // PRIME LOAD ORDER (same approach the lifecycle/known-bug specs rely on): evaluate
      // `bundle.ts` FIRST. Its early `@utils/logger/plugins` import drives `@utils/logger`
      // (and thus `RuntimeLogFormatterProvider`) to FULL initialization before `bundle.ts`'s
      // own bottom-of-file `export const bundle = new Bundle()` runs. Entering through a
      // logger module first instead would nest `new Bundle()` inside an still-initializing
      // `@utils/logger`, where `RuntimeLogFormatterProvider` is not yet defined — a separate
      // order-sensitive cycle (masked in production by esbuild's single-scope flattening).
      // The `bundle` constant produced here is incidental and never referenced.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('./bundle');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PureContainer } = require('./pure.container');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EnvConfigDefault } = require('@core/config/env.config.default');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { LoggerCliPlugin } = require('@utils/logger/plugins/plugin.cli/logger.cli.plugin');
      const {
        LoggerCliPluginExt,
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      } = require('@utils/logger/plugins/plugin.cli/logger.cli.plugin.ext');
      const {
        ApiSerializer,
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      } = require('@utils/serializer/services.serializer/api.services/api.serializer');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Serializer } = require('@utils/serializer/serializer');
      const {
        RuntimeLoggerFormatter,
        RuntimeLogFormatterProvider,
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      } = require('@utils/logger');

      // REAL Inversify-backed container, configured exactly like the production Bundle.
      const container: PureContainerClass = new PureContainer({ defaultScope: 'Singleton' });

      // Binding graph mirrors `Bundle.injectContainer()` (same keys, args, deps, order).
      container.tie({
        [DI.EnvConfigDefaultBind]: {
          instance: EnvConfigDefault,
          args: [{ value: false, condition: (support: boolean) => support }],
          dependencies: [],
        },
        [DI.ApiSerializerBind]: {
          instance: ApiSerializer,
          dependencies: [],
        },
        [DI.LoggerCli_plugin_ext]: {
          instance: LoggerCliPluginExt,
          dependencies: [],
        },
        [DI.LoggerCli_plugin]: {
          instance: LoggerCliPlugin,
          dependencies: [DI.EnvConfigDefaultBind, DI.LoggerCli_plugin_ext],
        },
        [DI.SerializerFactoryBind]: {
          instance: Serializer,
          dependencies: [DI.ApiSerializerBind],
        },
        [DI.LoggerRuntimeFormatter_Local]: {
          instance: RuntimeLoggerFormatter,
          args: [{ value: { logsProvider: RuntimeLogFormatterProvider.Local } }],
          dependencies: [],
        },
        [DI.LoggerRuntimeFormatter_Local_Shortened]: {
          instance: RuntimeLoggerFormatter,
          args: [
            {
              value: {
                logsProvider: RuntimeLogFormatterProvider.Local,
                isShortened: true,
              },
            },
          ],
          dependencies: [],
        },
        [DI.LoggerRuntimeFormatter_Aws]: {
          instance: RuntimeLoggerFormatter,
          args: [{ value: { logsProvider: RuntimeLogFormatterProvider.Aws } }],
          dependencies: [],
        },
      });

      // Resolve every subsystem through the REAL container (real factory composition).
      return {
        container,
        env: container.run<EnvConfigDefaultClass>(DI.EnvConfigDefaultBind),
        loggerPluginExt: container.run<LoggerCliPluginExtClass>(DI.LoggerCli_plugin_ext),
        loggerPlugin: container.run<LoggerCliPluginClass>(DI.LoggerCli_plugin),
        apiSerializer: container.run<ApiSerializerClass>(DI.ApiSerializerBind),
        serializer: container.run<SerializerClass>(DI.SerializerFactoryBind),
        formatterLocal: container.run<RuntimeLoggerFormatterClass>(
          DI.LoggerRuntimeFormatter_Local,
        ),
        formatterLocalShortened: container.run<RuntimeLoggerFormatterClass>(
          DI.LoggerRuntimeFormatter_Local_Shortened,
        ),
        formatterAws: container.run<RuntimeLoggerFormatterClass>(
          DI.LoggerRuntimeFormatter_Aws,
        ),
        classes: {
          PureContainer,
          EnvConfigDefault,
          LoggerCliPlugin,
          LoggerCliPluginExt,
          ApiSerializer,
          Serializer,
          RuntimeLoggerFormatter,
        },
      } as ComposedGraph;
    } finally {
      consoleRecords.restore();
    }
  });

describe('Bundle DI core — real-graph integration (Requirement 1.3)', () => {
  test('the full real subsystem graph composes and resolves through the real container without errors', async () => {
    const graph = await withEnv(VALID_ENV, () => composeRealGraph());
    // Let the real logger plugin finish its asynchronous initialization microtasks.
    await Promise.resolve();

    // Every subsystem resolved to a genuine production instance (not a fake/stub).
    expect(graph.env).toBeInstanceOf(graph.classes.EnvConfigDefault);
    expect(graph.loggerPluginExt).toBeInstanceOf(graph.classes.LoggerCliPluginExt);
    expect(graph.loggerPlugin).toBeInstanceOf(graph.classes.LoggerCliPlugin);
    expect(graph.apiSerializer).toBeInstanceOf(graph.classes.ApiSerializer);
    expect(graph.serializer).toBeInstanceOf(graph.classes.Serializer);
    expect(graph.formatterLocal).toBeInstanceOf(graph.classes.RuntimeLoggerFormatter);
    expect(graph.formatterLocalShortened).toBeInstanceOf(graph.classes.RuntimeLoggerFormatter);
    expect(graph.formatterAws).toBeInstanceOf(graph.classes.RuntimeLoggerFormatter);

    // The real container recorded the full tied graph (binding handles for every key).
    const tied = graph.container.tied;
    expect(tied).toBeDefined();
    expect(Object.keys(tied ?? {}).sort()).toEqual(
      [
        DI.EnvConfigDefaultBind,
        DI.ApiSerializerBind,
        DI.LoggerCli_plugin_ext,
        DI.LoggerCli_plugin,
        DI.SerializerFactoryBind,
        DI.LoggerRuntimeFormatter_Local,
        DI.LoggerRuntimeFormatter_Local_Shortened,
        DI.LoggerRuntimeFormatter_Aws,
      ].sort(),
    );
  });

  test('the config subsystem parses the controlled env into real configuration values', async () => {
    const graph = await withEnv(VALID_ENV, () => composeRealGraph());

    // Real Zod-validated parsing produced the controlled stage/provider.
    expect(graph.env.bundle.stage).toBe('prod');
    expect(graph.env.bundle.provider).toBe('integration-suite');

    // Real AWS region flowed through validation; non-support default schema accepted the
    // supplied credentials (so they are NOT the `dump` fallback).
    expect(graph.env.defaults.aws.credentials.region).toBe('eu-west-1');
    expect(graph.env.isAwsCredentialsDump()).toBe(false);
  });

  test('the logger subsystem composes against the real env dependency and exposes its instance API', async () => {
    const graph = await withEnv(VALID_ENV, () => composeRealGraph());
    await Promise.resolve();

    // The CLI logger resolved with its real `EnvConfigDefault` + `LoggerCliPluginExt`
    // dependencies and exposes the `LoggerInstance` surface (`now`/`future`).
    expect(typeof graph.loggerPlugin.now).toBe('function');
    expect(typeof graph.loggerPlugin.future).toBe('function');
    expect(typeof graph.loggerPlugin.stack).toBe('function');
  });

  test('the serializer subsystem composes around its real ApiSerializer dependency', async () => {
    const graph = await withEnv(VALID_ENV, () => composeRealGraph());

    // `Serializer` wraps the real `ApiSerializer` (resolved as a graph dependency).
    expect(graph.serializer.basic).toBeInstanceOf(graph.classes.ApiSerializer);

    // The real serializer behaviour composes: identity round-trips a payload unchanged.
    const payload = { id: 7, name: 'integration' };
    expect(graph.serializer.basic.identity(payload)).toEqual(payload);
    expect(graph.apiSerializer.identity('scalar')).toBe('scalar');
  });

  test('repeated resolution yields fresh instances, pinning the real per-run construction semantics', async () => {
    const graph = await withEnv(VALID_ENV, () => composeRealGraph());

    const envA = graph.container.run<EnvConfigDefaultClass>(DI.EnvConfigDefaultBind);
    const envB = graph.container.run<EnvConfigDefaultClass>(DI.EnvConfigDefaultBind);

    expect(envA).toBeInstanceOf(graph.classes.EnvConfigDefault);
    expect(envB).toBeInstanceOf(graph.classes.EnvConfigDefault);
    expect(envA).not.toBe(envB);
  });
});
