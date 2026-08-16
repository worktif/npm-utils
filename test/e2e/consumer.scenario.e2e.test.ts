// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import { handle, LambdaConsumerEvent, LambdaConsumerResult } from './fixtures/lambda-consumer';

/**
 * E2E / consumer-contract spec — Lambda-like consumer SCENARIO.
 *
 * Spec: library-test-coverage — Task 7.3.
 * Validates: Requirement 11.3 (a realistic Lambda-like scenario importing the BUILT
 * package exercises logger, serializer, and exception flows and asserts observable
 * output) and Requirement 11.5 (the scenario asserts only packaging/export/type/
 * RUNTIME regressions — a black-box happy-path-plus-error smoke, NOT exhaustive
 * branch coverage, which is owned by the lower pyramid levels).
 *
 * The scenario is driven through the external-consumer fixture
 * (`fixtures/lambda-consumer`), which imports EXCLUSIVELY from `@worktif/utils` — no
 * `src/`, no `@core/*` / `@utils/*` aliases. Under the Jest `e2e` project the package
 * specifier resolves to the BUILT artifact (`dist/bundle.js` at runtime), so this
 * spec observes exactly what a published consumer would.
 *
 * Observable output is captured at the process `console` sinks: the built bundle
 * routes the AWS Powertools Logger to the GLOBAL console (it sets `POWERTOOLS_DEV`
 * on load), so structured log records surface as JSON on `console.info` (INFO) and
 * `console.error` (ERROR). A fresh build is enforced by the `pretest:e2e` guard.
 */

// ---------------------------------------------------------------------------
// Stable identifiers the fixture handler emits (mirrors handler.ts constants).
// ---------------------------------------------------------------------------

/** `actionName` the handler passes to `initLog` (becomes the `method` log field). */
const ACTION_NAME = 'lambda-consumer.handle';

/** `serviceName` the handler configures on the logger (the `serviceName` log field). */
const SERVICE_NAME = 'e2e-lambda-consumer';

/** Documented `code` the BadRequest exception surfaces on the failure path. */
const BAD_REQUEST_CODE = 'BadRequestError';

/** Message the handler raises on the failure path. */
const FAILURE_MESSAGE = 'Consumer requested a failure';

// ---------------------------------------------------------------------------
// Self-contained console capture.
//
// This spec lives OUTSIDE `src/`, so it cannot use the in-repo test harness
// (`captureConsole`) — that would reach into source and break the consumer-contract
// boundary. The capture below is intentionally local to the e2e scope and spies the
// full set of sinks the Powertools Logger may use, so the assertion is robust to the
// exact sink chosen for a given level.
// ---------------------------------------------------------------------------

/** The console sinks the AWS Powertools Logger writes to, by level. */
const CONSOLE_SINKS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type ConsoleSink = (typeof CONSOLE_SINKS)[number];

/** A captured console call: the sink it hit and the argument array it received. */
interface ConsoleCall {
  readonly sink: ConsoleSink;
  readonly args: ReadonlyArray<unknown>;
}

/** Live capture handle: ordered calls across all sinks, plus a `restore()`. */
interface ConsoleCapture {
  readonly calls: ReadonlyArray<ConsoleCall>;
  restore(): void;
}

/**
 * Start capturing every {@link CONSOLE_SINKS} sink. Calls are recorded (not emitted)
 * in arrival order and exposed via the returned handle; `restore()` reinstates the
 * originals. Capture begins immediately.
 */
function captureAllConsole(): ConsoleCapture {
  const calls: ConsoleCall[] = [];
  const spies = CONSOLE_SINKS.map((sink) =>
    jest.spyOn(console, sink).mockImplementation((...args: unknown[]): void => {
      calls.push({ sink, args });
    }),
  );

  return {
    calls,
    restore(): void {
      spies.forEach((spy) => spy.mockRestore());
    },
  };
}

/**
 * Extract the structured log records the handler emitted: parse the single JSON
 * string argument of each captured call and keep only objects attributed to this
 * handler's `method` (`ACTION_NAME`). This isolates the handler's own observable
 * output from any unrelated console noise.
 */
function structuredRecordsFor(
  calls: ReadonlyArray<ConsoleCall>,
  method: string,
): ReadonlyArray<{ sink: ConsoleSink; record: Record<string, unknown> }> {
  const out: { sink: ConsoleSink; record: Record<string, unknown> }[] = [];
  for (const call of calls) {
    const [first] = call.args;
    if (typeof first !== 'string') {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(first);
    } catch {
      continue;
    }
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).method === method
    ) {
      out.push({ sink: call.sink, record: parsed as Record<string, unknown> });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic environment.
//
// The built bundle already sets `POWERTOOLS_DEV=true` on load (routing the logger to
// the global console). We pin it explicitly — plus a fixed STAGE and cleared debug /
// service overrides — so the scenario is independent of developer-machine state and
// emits structured records the spies can observe. Snapshot/restore keeps the suite
// hermetic (Requirement 2.1 / 2.5 spirit, applied at the e2e boundary).
// ---------------------------------------------------------------------------

const ENV_OVERRIDES: Readonly<Record<string, string | undefined>> = {
  POWERTOOLS_DEV: 'true',
  STAGE: 'test',
  RUNTIME_DEBUG: undefined,
  LOG_LEVEL: undefined,
  SERVICE_NAME: undefined,
};

let envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  envSnapshot = {};
  for (const key of Object.keys(ENV_OVERRIDES)) {
    envSnapshot[key] = process.env[key];
    const value = ENV_OVERRIDES[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

afterAll(() => {
  for (const key of Object.keys(envSnapshot)) {
    const value = envSnapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

/**
 * Run the consumer handler under console capture, flush the (async) logger init, and
 * return both the serialized result and the structured records the handler emitted.
 */
async function runScenario(event: LambdaConsumerEvent): Promise<{
  result: LambdaConsumerResult;
  records: ReadonlyArray<{ sink: ConsoleSink; record: Record<string, unknown> }>;
}> {
  const capture = captureAllConsole();
  try {
    const result = await handle(event);
    // `initLog` is async; flush pending microtasks before reading captured output.
    await Promise.resolve();
    const records = structuredRecordsFor(capture.calls, ACTION_NAME);
    return { result, records };
  } finally {
    capture.restore();
  }
}

/** Assert the shape of the serializer-produced API response envelope. */
function expectApiEnvelope(result: LambdaConsumerResult, statusCode: number): void {
  expect(result.statusCode).toBe(statusCode);
  expect(result.headers['Content-Type']).toBe('application/json');
  expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
  expect(typeof result.body).toBe('string');
}

describe('E2E consumer-contract: Lambda-like scenario observable output (Requirements 11.3, 11.5)', () => {
  it('success path: serializes a 200 envelope and emits an INFO structured log', async () => {
    const { result, records } = await runScenario({
      action: 'greet',
      payload: { user: 'ada', count: 3 },
    });

    // Serializer flow — observable response envelope.
    expectApiEnvelope(result, 200);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.message).toBe('ok');
    expect(body.action).toBe('greet');
    expect(body.payload).toEqual({ user: 'ada', count: 3 });

    // Logger flow — observable structured INFO record on the global console.
    const infoRecords = records.filter((r) => r.record.logLevel === 'INFO');
    expect(infoRecords.length).toBeGreaterThan(0);
    const emitted = infoRecords[0].record;
    expect(emitted.method).toBe(ACTION_NAME);
    expect(emitted.serviceName).toBe(SERVICE_NAME);
    expect(emitted.details).toEqual({ action: 'greet', payload: { user: 'ada', count: 3 } });
  });

  it('failure path: surfaces the typed exception as a 400 envelope and an ERROR log', async () => {
    const { result, records } = await runScenario({ action: 'fail' });

    // Serializer + exception flow — the typed CustomException becomes a 400 envelope.
    expectApiEnvelope(result, 400);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body.message).toBe(FAILURE_MESSAGE);
    expect(body.code).toBe(BAD_REQUEST_CODE);

    // Logger flow — observable structured ERROR record carrying the exception.
    const errorRecords = records.filter((r) => r.record.logLevel === 'ERROR');
    expect(errorRecords.length).toBeGreaterThan(0);
    const emitted = errorRecords[0].record;
    expect(emitted.method).toBe(ACTION_NAME);
    expect(emitted.serviceName).toBe(SERVICE_NAME);
    // The handler logs the caught Error; `initLog` shapes it to {message,name,stack}.
    expect(emitted.details).toMatchObject({ message: FAILURE_MESSAGE });
  });

  /**
   * Property 25: Lambda-like scenario produces observable output.
   *
   * **Feature: library-test-coverage, Property 25: Lambda-like scenario produces observable output**
   * **Validates: Requirements 11.3, 11.5**
   *
   * For ANY consumer event (a `greet` success carrying an arbitrary JSON-safe payload,
   * or a `fail` error), running the scenario against the BUILT package exercises all
   * three public flows and produces asserted observable output:
   *   - serializer: a well-formed API envelope (status 200 on success / 400 on error,
   *     JSON content type, CORS header, JSON-string body);
   *   - logger: at least one structured console record attributed to the handler's
   *     `method`, at the level matching the path (INFO success / ERROR failure);
   *   - exception: the failure path surfaces the documented `BadRequestError` code and
   *     message in the serialized body.
   *
   * This is a black-box happy-path-plus-error smoke (Requirement 11.5) — it pins
   * packaging/runtime observability, not branch-level behavior. `fast-check` samples
   * the event space with shrinking enabled across 100 runs.
   */
  it('Property 25: any consumer event produces asserted observable output across logger, serializer, and exception flows', async () => {
    /** JSON-safe scalar values so the payload round-trips through `JSON.stringify` exactly. */
    const arbScalar = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
    );

    /** A consumer-owned payload: a small record of JSON-safe scalars. */
    const arbPayload = fc.dictionary(fc.string(), arbScalar, { maxKeys: 5 });

    /** Either a success `greet` (with payload) or a `fail` event. */
    const arbEvent: fc.Arbitrary<LambdaConsumerEvent> = fc.oneof(
      arbPayload.map((payload): LambdaConsumerEvent => ({ action: 'greet', payload })),
      fc.constant<LambdaConsumerEvent>({ action: 'fail' }),
    );

    await fc.assert(
      fc.asyncProperty(arbEvent, async (event) => {
        const { result, records } = await runScenario(event);

        if (event.action === 'greet') {
          // Serializer flow.
          expectApiEnvelope(result, 200);
          const body = JSON.parse(result.body) as Record<string, unknown>;
          if (body.message !== 'ok' || body.action !== 'greet') {
            return false;
          }
          // Logger flow — an INFO record attributed to this handler must be observable.
          const infoRecords = records.filter(
            (r) => r.record.logLevel === 'INFO' && r.record.method === ACTION_NAME,
          );
          return (
            infoRecords.length > 0 &&
            infoRecords[0].record.serviceName === SERVICE_NAME
          );
        }

        // Failure path: serializer + exception flow.
        expectApiEnvelope(result, 400);
        const body = JSON.parse(result.body) as Record<string, unknown>;
        if (body.code !== BAD_REQUEST_CODE || body.message !== FAILURE_MESSAGE) {
          return false;
        }
        // Logger flow — an ERROR record attributed to this handler must be observable.
        const errorRecords = records.filter(
          (r) => r.record.logLevel === 'ERROR' && r.record.method === ACTION_NAME,
        );
        return (
          errorRecords.length > 0 &&
          errorRecords[0].record.serviceName === SERVICE_NAME
        );
      }),
      { numRuns: 100, endOnFailure: false },
    );
  });
});
