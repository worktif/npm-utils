# E2E / Consumer-Contract Tests

This directory holds end-to-end, consumer-contract specs (`*.e2e.test.ts`) that
exercise the **built** `dist/` artifact as an external consumer would — importing
via `package.json` `main`/`types`, with **no** `src/` imports and **no** repository
path aliases.

These tests run under the dedicated Jest `e2e` project and execute **only** after a
fresh `yarn build`:

```bash
yarn build
yarn test:e2e
```

They are intentionally excluded from the default `yarn test` (which selects the
`unit` project only) and from coverage collection.

## Layout

```
test/e2e/
├── README.md
├── tsconfig.e2e.json              # isolated consumer tsconfig (maps @worktif/utils → dist types)
├── guard/
│   └── ensure-fresh-dist.js       # pretest:e2e build-freshness guard (Requirement 11.4)
├── fixtures/
│   └── lambda-consumer/           # external-consumer fixture (imports only @worktif/utils)
│       ├── handler.ts
│       └── index.ts
└── *.e2e.test.ts                  # consumer-contract specs (tasks 7.2 / 7.3)
```

## How the built package is resolved

The Jest `e2e` project maps the published specifier `@worktif/utils` to the repo
root so Jest's resolver reads `package.json` `main` (→ `dist/bundle.js`) at runtime,
and `tsconfig.e2e.json` maps the same specifier to the built type entry
(`dist/src/index.d.ts`). There are **no** `@core/*` / `@utils/*` aliases in the e2e
scope, so fixtures and specs cannot reach into `src/`.

## Fresh-build guard

`yarn test:e2e` first runs the `pretest:e2e` hook
(`node test/e2e/guard/ensure-fresh-dist.js`), which fails fast when:

- `dist/bundle.js` (`main`) or `dist/src/index.d.ts` (`types`) is **missing**, or
- any build **input** (`src/**` excluding tests, `bin/esbuild/**`, `package.json`,
  `tsconfig.json`) is **newer** than the built artifacts (i.e. `dist/` is stale).

On failure it prints an actionable message instructing `yarn build`. It is a guard,
not a builder — it never rebuilds.

> Populated by spec `library-test-coverage`, Phase 6. Task 7.1 added the fixture,
> the isolated tsconfig, and the guard; tasks 7.2/7.3 add the consumer-contract
> specs that assert runtime/type/scenario contracts.
