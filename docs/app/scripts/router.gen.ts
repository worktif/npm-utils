// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import fs from 'fs';
import path from 'path';
import { MarkdownCollection } from './scripts.types';

/**
 * Represents the absolute file system path to the root directory of documentation files.
 * This path is resolved relative to the current module's directory.
 *
 * The value is typically determined by traversing three levels up from the module's directory
 * and locating a `.docs` folder, which is used for storing documentation artifacts.
 */
const DOCS_ROOT = path.resolve(__dirname, '../../../.docs');

/**
 * A variable representing the absolute file path to the router configuration file.
 * This variable uses Node.js's `path.resolve` method to determine the path relative
 * to the current module's directory (`__dirname`).
 * It resolves to the `router.tsx` file located in the `../src/` directory
 * relative to the current file location.
 *
 * This file often contains the route definitions and configurations for the application.
 */
const ROUTER_FILE = path.resolve(__dirname, '../src/router.tsx');

/**
 * Collects all markdown files from a given directory and generates route, import, and name information for each file.
 * This method recursively traverses directories to find all markdown files.
 *
 * @param {string} dir - The starting directory to search for markdown files.
 * @param {string} [prefix=''] - The URL prefix to apply to the route path.
 * @return {Array<{ importPath: string, routePath: string, importName: string }>}
 * An array of objects containing the import path, route path, and import name for each markdown file.
 */
function collectMarkdownFiles(dir: string, prefix = ''): MarkdownCollection[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: any[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(DOCS_ROOT, fullPath);
    const urlPath = path.join(prefix, entry.name).replace(/\\/g, '/').replace(/\.md$/, '');

    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath, urlPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const importPath = `../../../.docs/${relativePath}`.replace(/\\/g, '/');
      const importName = relativePath
        .replace(/\.md$/, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^(\d)/, '_$1');
      const routePath = '/' + urlPath.replace(/index$/, '').replace(/\/$/, '');
      results.push({ importPath, importName, routePath });
    }
  }

  return results;
}

/**
 * Generates a router file based on the provided collection of markdown files.
 * This function creates a React router configuration by dynamically importing
 * markdown files and mapping them to route paths.
 *
 * @param {Array} files - An array of objects returned by the `collectMarkdownFiles` function.
 * Each object should contain `importName`, `importPath`, and `routePath` properties.
 *
 * @return {void} This function writes the generated router file to the filesystem.
 */
function generateRouterFile(files: ReturnType<typeof collectMarkdownFiles>) {
  const imports = files.map(f => `import ${f.importName} from '${f.importPath}?raw';`).join('\n');
  const routes = files
    .map(f => `  <Route path="${f.routePath}" element={<MarkdownPage content={${f.importName}} />} />`)
    .join('\n');

  /**
   * Defines the main router of the application using React Router.
   *
   * The `Router` component sets up the routing structure of the application.
   * It dynamically imports and integrates the defined `MarkdownPage` component
   * and adheres to the provided routing logic defined by `{routes}`.
   *
   * Note:
   * - The software is governed by the Business Source License 1.1.
   * - License information and usage terms are specified in the LICENSE file.
   * - Use of this software is controlled by the specified Change Date and licensing terms.
   *
   * SPDX-License-Identifier: BUSL-1.1
   */
  const content = `// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors
 
import * as React from 'react';
import { Routes, Route } from 'react-router';
import MarkdownPage from './components/MarkdownPage';

${imports}

const Router = () => (
  <Routes>
${routes}
  </Routes>
);

export default Router;
`;

  fs.writeFileSync(ROUTER_FILE, content, 'utf-8');
  console.log(`✓ router.tsx generated successfully: ${ROUTER_FILE}`);
}

/**
 * Collects all markdown files from the specified directory.
 *
 * This variable stores the result of invoking `collectMarkdownFiles` with the `DOCS_ROOT` directory.
 * The `collectMarkdownFiles` function traverses the file structure within the specified directory
 * and retrieves a list of markdown files (.md).
 *
 * @type {Array<string>} An array of file paths representing the markdown files found in the directory.
 */
const files = collectMarkdownFiles(DOCS_ROOT);

generateRouterFile(files);
