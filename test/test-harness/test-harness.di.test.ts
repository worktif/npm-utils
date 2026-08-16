// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import * as fc from 'fast-check';

import {
  arbBindingKey,
  arbConstBindingKey,
  arbCtorArgs,
  arbLambdaKey,
  arbStage,
  FakeLeaf,
  FakeNode,
  ThrowingCtor,
  THROWING_CTOR_MESSAGE,
} from './index';

// Mirror the production predicates these arbitraries are designed to feed, so the
// sanity checks assert against the real conventions rather than restating literals.
const isLambdaInstance = (key: string): boolean =>
  key.startsWith('lambda_') && key.endsWith('_factory_bind');
const isConstBinding = (key: string): boolean => key.endsWith('_const_bind');

describe('DI test fakes', () => {
  test('FakeLeaf captures its tag verbatim', () => {
    expect(new FakeLeaf('alpha').tag).toBe('alpha');
  });

  test('FakeNode keeps arg and dep in positional order', () => {
    const dep = new FakeLeaf('leaf');
    const node = new FakeNode(42, dep);

    expect(node.arg).toBe(42);
    expect(node.dep).toBe(dep);
    expect(node.dep).toBeInstanceOf(FakeLeaf);
  });

  test('ThrowingCtor always throws the documented message', () => {
    expect(() => new ThrowingCtor()).toThrow(THROWING_CTOR_MESSAGE);
  });
});

describe('DI fast-check arbitraries', () => {
  test('arbBindingKey yields plain factory keys (not const, not lambda)', () => {
    fc.assert(
      fc.property(arbBindingKey, (key) => {
        return (
          key.endsWith('_bind') &&
          !isConstBinding(key) &&
          !isLambdaInstance(key)
        );
      }),
    );
  });

  test('arbConstBindingKey yields keys routed to runConstant', () => {
    fc.assert(
      fc.property(arbConstBindingKey, (key) => isConstBinding(key)),
    );
  });

  test('arbLambdaKey yields keys detected as lambda instances', () => {
    fc.assert(
      fc.property(arbLambdaKey, (key) => isLambdaInstance(key)),
    );
  });

  test('arbCtorArgs yields arrays of constructor argument values', () => {
    fc.assert(
      fc.property(arbCtorArgs, (args) => Array.isArray(args) && args.length <= 5),
    );
  });

  test('arbStage yields non-empty lowercase stage tokens', () => {
    fc.assert(
      fc.property(arbStage, (stage) => stage.length > 0 && stage === stage.toLowerCase()),
    );
  });
});
