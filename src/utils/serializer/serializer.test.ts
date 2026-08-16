// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * `Serializer` imports the `./services.serializer` barrel, which transitively evaluates
 * `graphql.serializer.ts` (→ `@utils/logger` → `../../bundle`). We stub the `@core/bundle`
 * barrel with the minimal `cli.logger` surface to contain the `new Bundle()` module-load side
 * effect — the established isolation pattern from `logger.test.ts`. No production source is
 * modified; the mock resolves to the same `src/bundle` module.
 */
jest.mock('../../bundle', () => ({
  bundle: {
    cli: {
      logger: {
        error: jest.fn(),
        stack: jest.fn(),
      },
    },
  },
}));

// Prime the concrete `ApiSerializer` into the module registry before the barrel chain that
// `Serializer` triggers, keeping the import deterministic (see graphql.serializer.test.ts).
import { ApiSerializer } from './services.serializer/api.services/api.serializer';
import { Serializer } from './serializer';

/**
 * Task 4.1 — Cover the `Serializer` composition root.
 *
 * Characterization scope: `Serializer` is a thin DI value object whose constructor stores the
 * injected `ApiSerializer` under `basic`. There is no transformation logic of its own; the
 * graph wiring (`@inject(LazyServiceIdentifier(...))`) is exercised by the DI integration
 * suite. Here we pin the constructor contract directly with a concrete collaborator.
 */
describe('Serializer — composition root (Requirement 6.1)', () => {
  test('stores the injected ApiSerializer under `basic` without modification', () => {
    const api = new ApiSerializer();

    const serializer = new Serializer(api);

    // The constructor is a pure assignment: the exact injected reference is exposed.
    expect(serializer.basic).toBe(api);
  });

  test('delegates the inherited identity transformation through `basic`', () => {
    const api = new ApiSerializer();
    const serializer = new Serializer(api);

    const payload = { data: { ok: true }, statusCode: 200 };
    expect(serializer.basic.identity<typeof payload, typeof payload>(payload)).toBe(payload);
  });
});
