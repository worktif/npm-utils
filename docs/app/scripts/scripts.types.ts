// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

/**
 * Represents a collection of metadata about a Markdown file or resource.
 *
 * This type is useful for managing and organizing data about Markdown files,
 * such as their import paths, routing information, and import names for use
 * within applications or modules that dynamically handle Markdown content.
 *
 * Properties:
 * - `importPath`: The file system path or module path to the Markdown resource.
 * - `routePath`: The URL path or routing path associated with the Markdown resource.
 * - `importName`: The identifier or name used to import the Markdown resource in code.
 */
export type MarkdownCollection = {
  importPath: string;
  routePath: string;
  importName: string;
}


