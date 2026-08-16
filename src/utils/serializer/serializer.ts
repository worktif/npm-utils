// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-present Raman Marozau <raman@worktif.com>, target function contributors

import 'reflect-metadata';

import { inject, injectable } from 'inversify';
import { LazyServiceIdentifier } from '@inversifyjs/common';

import { Di } from '@utils/di/di.types';
import { ApiSerializer } from './services.serializer';
import { composeFactoryBind } from '@utils/di';

/**
 * Class representing a Serializer.
 */
@injectable()
export class Serializer {
  /**
   * Initializes a new instance of the constructor.
   *
   * @constructor
   * @return {void}
   */
  constructor(
    @inject(new LazyServiceIdentifier(() => composeFactoryBind(Di.ApiSerializerBind)))
    public basic: ApiSerializer,
  ) {
  }
}
