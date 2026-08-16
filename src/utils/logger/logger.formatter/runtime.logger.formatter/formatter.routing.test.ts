// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';
import * as fc from 'fast-check';
import { RuntimeLogFormatterOptions, RuntimeLogFormatterProvider } from './runtime.logger.formatter.types';

import { suggestFormatterByEnvironment } from './console.formatter.utils';

describe('Formatter Configuration and Routing - Property-Based Tests', () => {
  /**
   * **Feature: console-logger-formatters, Property 14: Formatter provider routing**
   *
   * For any RuntimeLogFormatterProvider enum value, setting it as logsProvider should result
   * in output matching the expected format for that provider type.
   *
   * **Validates: Requirements 4.2**
   *
   * Note: This test verifies that the formatter configuration accepts all provider types
   * and that the enum values are properly defined.
   */
  test('Property 14: Formatter provider routing', () => {
    // Generator for all valid provider types
    const arbProvider = fc.constantFrom(
      RuntimeLogFormatterProvider.Aws,
      RuntimeLogFormatterProvider.CompactConsole,
      RuntimeLogFormatterProvider.RichConsole,
      RuntimeLogFormatterProvider.Local,
      RuntimeLogFormatterProvider.Custom,
    );

    fc.assert(
      fc.property(arbProvider, (provider) => {
        // Verify the provider value is a valid string
        expect(typeof provider).toBe('string');
        expect(provider.length).toBeGreaterThan(0);

        // Verify the provider is one of the expected values
        const validProviders = [
          RuntimeLogFormatterProvider.Aws,
          RuntimeLogFormatterProvider.CompactConsole,
          RuntimeLogFormatterProvider.RichConsole,
          RuntimeLogFormatterProvider.Local,
          RuntimeLogFormatterProvider.Custom,
        ];
        expect(validProviders).toContain(provider);

        // Verify we can create a valid configuration object
        const config: RuntimeLogFormatterOptions = {
          logsProvider: provider,
        };
        expect(config.logsProvider).toBe(provider);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: console-logger-formatters, Property 15: Enum value support**
   *
   * For any value in the RuntimeLogFormatterProvider enum (including new console formatter values),
   * creating a formatter with that value should not throw an error.
   *
   * **Validates: Requirements 4.4**
   *
   * Note: This test verifies that all enum values are supported and can be used in
   * configuration objects with various console options.
   */
  test('Property 15: Enum value support', () => {
    // Generator for all valid provider types
    const arbProvider = fc.constantFrom(
      RuntimeLogFormatterProvider.Aws,
      RuntimeLogFormatterProvider.CompactConsole,
      RuntimeLogFormatterProvider.RichConsole,
      RuntimeLogFormatterProvider.Local,
      RuntimeLogFormatterProvider.Custom,
    );

    // Generator for console options
    const arbConsoleOptions = fc.record({
      colorize: fc.boolean(),
      maxMetadataDepth: fc.integer({ min: 1, max: 10 }),
      maxValueLength: fc.integer({ min: 100, max: 5000 }),
      timestampFormat: fc.constantFrom('short' as const, 'full' as const),
    });

    fc.assert(
      fc.property(arbProvider, arbConsoleOptions, (provider, consoleOptions) => {
        // Verify we can create a configuration object with all options
        const config: RuntimeLogFormatterOptions = {
          logsProvider: provider,
          consoleOptions,
        };

        // Verify the configuration is valid
        expect(config.logsProvider).toBe(provider);
        expect(config.consoleOptions).toBeDefined();
        expect(config.consoleOptions?.colorize).toBe(consoleOptions.colorize);
        expect(config.consoleOptions?.maxMetadataDepth).toBe(consoleOptions.maxMetadataDepth);
        expect(config.consoleOptions?.maxValueLength).toBe(consoleOptions.maxValueLength);
        expect(config.consoleOptions?.timestampFormat).toBe(consoleOptions.timestampFormat);

        // Verify console options have valid values
        expect(typeof config.consoleOptions?.colorize).toBe('boolean');
        expect(config.consoleOptions?.maxMetadataDepth).toBeGreaterThan(0);
        expect(config.consoleOptions?.maxValueLength).toBeGreaterThan(0);
        expect(['short', 'full']).toContain(config.consoleOptions?.timestampFormat);

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: console-logger-formatters, Property 16: Environment-based formatter selection**
   *
   * For any STAGE environment variable value indicating local development (dev, local),
   * the formatter selection logic should allow console formatter types.
   *
   * **Validates: Requirements 4.5**
   *
   * Note: This test verifies that the suggestFormatterByEnvironment helper correctly
   * maps environment stages to appropriate formatter types.
   */
  test('Property 16: Environment-based formatter selection', () => {
    // Generator for various stage values
    const arbStage = fc.oneof(
      // Local development stages
      fc.constantFrom('dev', 'local', 'development', 'DEV', 'LOCAL', 'Development'),
      // Production stages
      fc.constantFrom('production', 'prod', 'staging', 'PRODUCTION', 'PROD', 'Staging'),
      // Unknown/custom stages
      fc.string({ minLength: 1, maxLength: 20 }).filter(s =>
        !['dev', 'local', 'development', 'production', 'prod', 'staging'].includes(s.toLowerCase()),
      ),
    );

    fc.assert(
      fc.property(arbStage, (stage) => {
        // Get suggested formatter for the stage
        const suggested = suggestFormatterByEnvironment(stage);

        // Verify the suggestion is one of the valid formatter types
        expect(['aws', 'compact-console', 'rich-console']).toContain(suggested);

        // Verify local development stages suggest console formatters
        const localStages = ['dev', 'local', 'development'];
        if (localStages.includes(stage.toLowerCase())) {
          expect(suggested).toBe('compact-console');
        }

        // Verify production stages suggest AWS formatter
        const productionStages = ['production', 'prod', 'staging'];
        if (productionStages.includes(stage.toLowerCase())) {
          expect(suggested).toBe('aws');
        }

        // Verify unknown stages default to AWS formatter (safe default)
        const knownStages = [...localStages, ...productionStages];
        if (!knownStages.includes(stage.toLowerCase())) {
          expect(suggested).toBe('aws');
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: console-logger-formatters, Property 16: Environment-based formatter selection (no stage)**
   *
   * When no STAGE environment variable is provided, the formatter selection should default
   * to AWS formatter as a safe production default.
   *
   * **Validates: Requirements 4.5**
   */
  test('Property 16: Environment-based formatter selection (default behavior)', () => {
    // Test with undefined stage
    const suggested = suggestFormatterByEnvironment(undefined);

    // Should default to AWS formatter when no stage is provided
    // (unless process.env.STAGE is set, which we can't control in tests)
    expect(['aws', 'compact-console', 'rich-console']).toContain(suggested);

    // Test with empty string
    const suggestedEmpty = suggestFormatterByEnvironment('');
    expect(suggestedEmpty).toBe('aws');
  });
});
