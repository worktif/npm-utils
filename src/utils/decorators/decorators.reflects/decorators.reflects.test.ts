// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Task 6.1 — unit coverage for the decorator reflection utilities `AutoParamTypes` and
 * `MetaClassName` (Requirement 9.4: metadata read/write with `reflect-metadata` imported
 * first). These utilities only depend on the `reflect-metadata` polyfill (loaded above),
 * so no bundle isolation is required.
 */

import { AutoParamTypes, MetaClassName } from './decorators.reflects';

describe('AutoParamTypes — copies design:paramtypes to paramTypes (Requirement 9.4)', () => {
  test('copies an explicitly defined design:paramtypes onto the paramTypes key', () => {
    class Target {
      constructor(public name: string, public count: number) { }
    }

    Reflect.defineMetadata('design:paramtypes', [String, Number], Target);

    AutoParamTypes(Target);

    expect(Reflect.getMetadata('paramTypes', Target)).toEqual([String, Number]);
  });

  test('reads emitted constructor parameter types when applied as a class decorator', () => {
    // With `emitDecoratorMetadata` enabled, decorating the class causes TypeScript to emit
    // `design:paramtypes`; AutoParamTypes then mirrors them to `paramTypes`.
    @AutoParamTypes
    class Decorated {
      constructor(public label: string, public flag: boolean) { }
    }

    expect(Reflect.getMetadata('paramTypes', Decorated)).toEqual([String, Boolean]);
  });

  test('writes undefined when no design:paramtypes metadata exists', () => {
    class Bare { }

    AutoParamTypes(Bare);

    // The utility unconditionally writes whatever it read — undefined when absent.
    expect(Reflect.hasMetadata('paramTypes', Bare)).toBe(true);
    expect(Reflect.getMetadata('paramTypes', Bare)).toBeUndefined();
  });
});

describe('MetaClassName — copies class:name to className (Requirement 9.4)', () => {
  test('copies an explicitly defined class:name onto the className key', () => {
    class Service { }

    Reflect.defineMetadata('class:name', 'MyService', Service);

    MetaClassName(Service);

    expect(Reflect.getMetadata('className', Service)).toBe('MyService');
  });

  test('writes undefined when no class:name metadata exists', () => {
    class Anonymous { }

    MetaClassName(Anonymous);

    expect(Reflect.hasMetadata('className', Anonymous)).toBe(true);
    expect(Reflect.getMetadata('className', Anonymous)).toBeUndefined();
  });

  test('keeps metadata isolated per target', () => {
    class A { }
    class B { }

    Reflect.defineMetadata('class:name', 'A-name', A);
    Reflect.defineMetadata('class:name', 'B-name', B);

    MetaClassName(A);
    MetaClassName(B);

    expect(Reflect.getMetadata('className', A)).toBe('A-name');
    expect(Reflect.getMetadata('className', B)).toBe('B-name');
  });
});
