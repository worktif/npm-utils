// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { build, BuildOptions } from 'esbuild';

// Command line parameters
const args: string[] = process.argv.slice(2);
const targetArg: string | undefined = args.find(arg => arg.startsWith('--target='));
const testArg: string | undefined = args.find(arg => arg.startsWith('--test='));
const target = targetArg?.split('=')[1] as keyof typeof builds;
const testInstance = testArg?.split('=')[1] as string;

const isProd = process.env.NODE_ENV === 'production';

// General settings
const shared: BuildOptions = {
  bundle: true,
  platform: 'node',
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  target: ['node12'], // or 'es2022'
  logLevel: 'info',
  legalComments: 'none',
  external: [
    'aws-cdk-lib',
    'constructs',
    'fs',
    'path',
    'bundle.js'
  ],
};

// Array of builds
const builds: { [target: string]: BuildOptions & { label: string } } = {
  utils: {
    entryPoints: ['src/index.ts'],
    outfile: 'dist/bundle.js',
    bundle: true,
    platform: 'node',
    jsx: 'automatic',
    legalComments: 'none',
    external: ['aws-cdk-lib', 'constructs', 'fs', 'path'],
    format: 'cjs',
    target: ['es2020'],
    minify: true,
    label: 'utils',
  },
};

// Select by target
const selectedBuilds = target ? { [target]: builds[target] } : builds;

// Launch
(async () => {
  for (const [name, config] of Object.entries(selectedBuilds)) {
    if (!config) {
      console.error(`✗ Unknown target: ${name}`);
      process.exit(1);
    }
    console.log(`⇒ Building "${name}"...`);
    await build({
      ...shared,
      entryPoints: config.entryPoints,
      outfile: config.outfile,
    });
    console.log(`✓ Done: ${config.outfile}`);
  }
})().catch((e) => {
  console.error('! Build failed:', e);
  process.exit(1);
});

