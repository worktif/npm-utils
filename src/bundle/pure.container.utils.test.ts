// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { composeFactoryBind } from '@utils/di';

import { Constructor, createInstance } from './pure.container.utils';
import {
  FakeLeaf,
  FakeNode,
  ThrowingCtor,
  THROWING_CTOR_MESSAGE,
} from '../../test/test-harness';

/**
 * Task 2.1 — Cover `composeFactoryBind` and `pure.container.utils`.
 *
 * Scope: example-based unit tests only. The corresponding property-based test
 * (Property 1: Factory token composition is total and deterministic) is owned by
 * Task 2.2 and intentionally NOT duplicated here.
 *
 * Requirements: 4.1.
 */

describe('composeFactoryBind — factory token composition', () => {
  test('wraps a plain binding name in the Factory<...> envelope', () => {
    expect(composeFactoryBind('logger_bind')).toBe('Factory<logger_bind>');
  });

  test('composes tokens for the documented Di-style keys verbatim', () => {
    expect(composeFactoryBind('env_config_default_bind')).toBe(
      'Factory<env_config_default_bind>',
    );
    expect(composeFactoryBind('lambda_create_user_factory_bind')).toBe(
      'Factory<lambda_create_user_factory_bind>',
    );
    expect(composeFactoryBind('feature_flag_const_bind')).toBe(
      'Factory<feature_flag_const_bind>',
    );
  });

  test('is total: produces a token even for the empty-string name', () => {
    expect(composeFactoryBind('')).toBe('Factory<>');
  });

  test('does not collapse or trim names containing inner whitespace/symbols', () => {
    expect(composeFactoryBind('a b-c.d')).toBe('Factory<a b-c.d>');
  });

  test('is deterministic: repeated calls with the same name are identical', () => {
    const first = composeFactoryBind('serializer_bind');
    const second = composeFactoryBind('serializer_bind');
    const third = composeFactoryBind('serializer_bind');

    expect(first).toBe('Factory<serializer_bind>');
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test('is injective across distinct names (distinct inputs → distinct tokens)', () => {
    const tokenA = composeFactoryBind('alpha_bind');
    const tokenB = composeFactoryBind('beta_bind');

    expect(tokenA).not.toBe(tokenB);
  });

  test('always returns a string (token, not a binding handle)', () => {
    expect(typeof composeFactoryBind('any_bind')).toBe('string');
  });
});

describe('createInstance / Constructor — construction behavior', () => {
  test('constructs a single-argument instance, forwarding deps positionally', () => {
    const leaf = createInstance(FakeLeaf, ['tag-a']);

    expect(leaf).toBeInstanceOf(FakeLeaf);
    expect(leaf.tag).toBe('tag-a');
  });

  test('preserves argument order when spreading the deps array', () => {
    const leaf = new FakeLeaf('leaf');
    const node = createInstance(FakeNode, ['arg-value', leaf]);

    expect(node).toBeInstanceOf(FakeNode);
    expect(node.arg).toBe('arg-value');
    expect(node.dep).toBe(leaf);
    expect(node.dep).toBeInstanceOf(FakeLeaf);
  });

  test('supports zero-dependency construction', () => {
    class NoArgs {
      public readonly ready = true;
    }

    const instance = createInstance(NoArgs, []);

    expect(instance).toBeInstanceOf(NoArgs);
    expect(instance.ready).toBe(true);
  });

  test('returns a fresh instance on each call (no caching)', () => {
    const first = createInstance(FakeLeaf, ['x']);
    const second = createInstance(FakeLeaf, ['x']);

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  test('propagates a constructor failure to the caller unchanged', () => {
    expect(() => createInstance(ThrowingCtor, [])).toThrow(THROWING_CTOR_MESSAGE);
  });

  test('honors the Constructor<T> contract: typed handle yields a typed instance', () => {
    // `Constructor<FakeLeaf>` is the exact shape `createInstance` expects; binding the
    // class to that type proves the generic flows the instance type through to the result.
    const ctor: Constructor<FakeLeaf> = FakeLeaf;
    const instance: FakeLeaf = createInstance(ctor, ['typed']);

    expect(instance).toBeInstanceOf(FakeLeaf);
    expect(instance.tag).toBe('typed');
  });

  test('Constructor<T> accepts any class assignable to its new-signature', () => {
    // Compile-time contract: arbitrary classes satisfy `Constructor<T>` regardless of
    // arity. Exercised at runtime to keep the type assertion observable.
    const leafCtor: Constructor<FakeLeaf> = FakeLeaf;
    const nodeCtor: Constructor<FakeNode> = FakeNode;

    expect(createInstance(leafCtor, ['l'])).toBeInstanceOf(FakeLeaf);
    expect(
      createInstance(nodeCtor, ['n', new FakeLeaf('dep')]),
    ).toBeInstanceOf(FakeNode);
  });
});
