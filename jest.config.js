/**
 * Jest configuration for @worktif/utils.
 *
 * Spec: library-test-coverage — Task 1.3 (coverage thresholds + Jest projects).
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5.
 *
 * Design decisions encoded here:
 *
 * 1. Coverage is COLLECTED ONLY when `--coverage` is passed (e.g. `yarn test:coverage`
 *    or CI). `collectCoverage` is intentionally NOT forced to `true`, so the default
 *    `yarn test` runs fast and — critically — does NOT enforce `coverageThreshold`
 *    while the characterization suite is still being authored phase-by-phase.
 *    The thresholds below are the real design targets and are enforced the moment
 *    coverage is collected; they are gated, not weakened. See Requirement 12.5 /
 *    the CI gate notes in the spec design.
 *
 * 2. Tests are split into Jest `projects`:
 *      - `unit`  → all unit + integration specs under `src/` (path aliases mapped).
 *      - `e2e`   → consumer-contract specs under `test/e2e/` that import the BUILT
 *                  package as an external consumer (NO path aliases, NO `src/`).
 *    The default `test` script selects only the `unit` project, so e2e never runs on
 *    a normal `yarn test`; e2e runs exclusively via `yarn test:e2e` AFTER `yarn build`.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */

/** Shared ts-jest transform (single source of truth across projects). */
const tsJestTransform = {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
};

/** Path-alias resolution for in-repo (`src/`) tests only. */
const srcModuleNameMapper = {
    '^@core/bundle/(.*)$': '<rootDir>/src/bundle/$1',
    '^@core/config/(.*)$': '<rootDir>/src/config/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
};

module.exports = {
    // --- Coverage collection scope ---------------------------------------------
    // Which production files count toward coverage when `--coverage` is enabled.
    //
    // NOTE: `collectCoverageFrom` force-includes matching files in the report (so
    // untested files surface as 0%). Because of that, the justified exclusions below
    // MUST be expressed here as negations too — `coveragePathIgnorePatterns` alone is
    // overridden by an explicit `collectCoverageFrom` glob. Keeping both in sync
    // ensures excluded files never enter the coverage denominator or the per-path
    // `coverageThreshold` globs.
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.test.ts',          // test files are not production code
        '!src/**/*.d.ts',             // generated declarations
        '!src/**/index.ts',           // barrel re-exports (no runtime logic)
        '!src/**/*.types.ts',         // type-only declarations (erased at runtime)
        '!src/utils/structure/interfaces.structure/**', // interface declarations
        '!src/test-harness/**',       // test infrastructure, not production code
    ],

    // Per-file reporters: human-readable summary + machine-readable lcov for CI.
    coverageReporters: ['text', 'lcov'],

    // --- Excluded from coverage (each exclusion justified) ----------------------
    // These paths carry no executable production logic worth gating on; including
    // them would distort the line/branch denominators. (Design: "Excluded From
    // Coverage (Justified)".)
    coveragePathIgnorePatterns: [
        '/node_modules/',
        // Barrel re-exports (`index.ts`) — re-export only, no runtime logic.
        '<rootDir>/src/.*/index\\.ts$',
        '<rootDir>/src/index\\.ts$',
        // Type-only declarations — erased at runtime, nothing to execute.
        '<rootDir>/src/.*\\.types\\.ts$',
        // Interface declarations — structural contracts, no runtime body.
        '<rootDir>/src/utils/structure/interfaces\\.structure/',
        // Generated declaration files — emitted artifacts, not source.
        '\\.d\\.ts$',
        // Test infrastructure — harness helpers, fakes, arbitraries, fixtures are
        // test code, not production code, and must not be gated as such.
        '<rootDir>/src/test-harness/',
        // E2E specs and consumer fixtures live outside `src/` entirely.
        '<rootDir>/test/',
    ],

    // --- Coverage gate (enforced only when coverage is collected) ---------------
    // Global library target plus a stricter gate for the DI core, which is the
    // optimization safety net (Requirements 12.2, 12.3).
    coverageThreshold: {
        global: {
            lines: 90,
            branches: 85,
            functions: 90,
        },
        // DI core — higher bar (95% lines / 90% branches).
        './src/bundle/**/*.ts': {
            lines: 95,
            branches: 90,
        },
        './src/utils/di/**/*.ts': {
            lines: 95,
            branches: 90,
        },
    },

    // --- Run-wide options -------------------------------------------------------
    maxWorkers: 2,

    // --- Project split: unit/integration (src) vs e2e (built package) -----------
    projects: [
        {
            displayName: 'unit',
            preset: 'ts-jest',
            testEnvironment: 'node',
            // Covers BOTH unit and integration specs (all live under src/).
            roots: ['<rootDir>/src'],
            testMatch: ['**/*.test.ts'],
            moduleNameMapper: srcModuleNameMapper,
            transform: tsJestTransform,
            testTimeout: 30000,
        },
        {
            displayName: 'e2e',
            preset: 'ts-jest',
            testEnvironment: 'node',
            // Consumer-contract specs against the built `dist/` artifact.
            // No path aliases: the fixture imports the package as an external
            // consumer would. This project must run only AFTER `yarn build`.
            roots: ['<rootDir>/test/e2e'],
            testMatch: ['**/*.e2e.test.ts'],
            // Resolve the PUBLISHED package name to the repo root so Jest's resolver
            // reads `package.json` `main` (→ dist/bundle.js). This pins the actual
            // published runtime entry contract, exactly as `npm install` would wire
            // it for an external consumer. NOTE: only the package name is mapped —
            // no `@core/*` / `@utils/*` aliases exist here, so fixtures cannot reach
            // into `src/`. Requires a fresh build (enforced by the `pretest:e2e`
            // guard) — this project must run only AFTER `yarn build`.
            moduleNameMapper: {
                '^@worktif/utils$': '<rootDir>',
            },
            // Compile e2e specs/fixtures with the isolated consumer tsconfig, which
            // maps `@worktif/utils` types to the BUILT `dist/src/index.d.ts` and does
            // NOT inherit the repository source path aliases.
            transform: {
                '^.+\\.tsx?$': [
                    'ts-jest',
                    { tsconfig: '<rootDir>/test/e2e/tsconfig.e2e.json' },
                ],
            },
            testTimeout: 30000,
        },
    ],
};
