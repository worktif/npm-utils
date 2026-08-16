/*
 * Business Source License 1.1
 *
 * Copyright (C) 2025 Raman Marozau, raman@worktif.com
 * Use of this software is governed by the Business Source License included in the LICENSE file and at www.mariadb.com/bsl11.
 *
 * Change Date: Never
 * On the date above, in accordance wth the Business Source License, use of this software will be governed by the open source license specified in the LICENSE file.
 * Additional Use Grant: Free for personal and non-commercial research use only.
 *
 *
 * SPDX-License-Identifier: BUSL-1.1
 */

import 'reflect-metadata';

import { injectable } from 'inversify';

import { z, ZodError, ZodSafeParseResult } from 'zod';

import { EnvConfigSchemaDefault, EnvSchemaDescriptor, EnvSchemaDescriptorValues } from '@core/config/env.config.types';

import { Maybe, Nullable } from '@utils/common/common.types';
import { isBrowser } from '@utils/common';

if (!isBrowser) {
  require('dotenv').config({
    quiet: true,
  });
}

/**
 * The default stage or environment identifier used in the application.
 * This variable typically represents the default operational context and
 * can be used to determine configurations or behaviors specific to the stage.
 *
 * By default, the value is set to 'dev', indicating the development environment.
 * Other potential stage values might include 'prod', 'test', or 'staging',
 * depending on the application's environment setup.
 *
 * Value: 'dev'
 *
 * Usage context: Environment configuration management.
 */
const STAGE_DEFAULT = 'dev';

/**
 * Represents a list of stages.
 *
 * @typedef {string[]} StageList
 */
const stageList: string[] = [STAGE_DEFAULT, 'stage', 'prod', 'own', 'local'];


/**
 * Represents the schema for the environment configuration.
 */
export const envConfigSchemaDefault = z.object({
  // Cloud Bundle Common
  bundle: z.object({
    STAGE: z.string().default(STAGE_DEFAULT),
    PROVIDER: z.string().nullish(),
    DEBUG: z.string().nullish(),
  }),

  // Cloud Bundle AWS
  aws: z.object({
    cdk: z.object({
      CDK_DEFAULT_ACCOUNT: z.string().nullish(),
      CDK_DEFAULT_REGION: z.string().nullish(),
    }),
    credentials: z.object({
      AWS_REGION: z.string(),
      AWS_ACCESS_KEY_ID: z.string(),
      AWS_SECRET_ACCESS_KEY: z.string(),
      AWS_SESSION_TOKEN: z.string().nullish(),
    }),
  }).nullish(),

  //
  // ...other environment variables
  //
});

/**
 * Represents the schema for the environment configuration.
 */
export const envConfigSchemaSupport = z.object({
  // Cloud Bundle Common
  bundle: z.object({
    STAGE: z.string().default(STAGE_DEFAULT),
    PROVIDER: z.string().nullish(),
    DEBUG: z.string().nullish(),
  }),

  // Cloud Bundle AWS
  aws: z.object({
    cdk: z.object({
      CDK_DEFAULT_ACCOUNT: z.string().nullish(),
      CDK_DEFAULT_REGION: z.string().nullish(),
    }),
    credentials: z.object({
      AWS_REGION: z.string(),
      AWS_ACCESS_KEY_ID: z.string().nullish(),
      AWS_SECRET_ACCESS_KEY: z.string().nullish(),
      AWS_SESSION_TOKEN: z.string().nullish(),
    }),
  }).nullish(),

  //
  // ...other environment variables
  //
});

export const DEFAULT_AWS_REGION = 'us-east-1';

/**
 * Enum representing the stages of a website deployment.
 *
 * This enum is typically used to differentiate between the production
 * and staging environments of a website.
 *
 * Enum Members:
 * - `Prod`: Represents the production environment.
 * - `Staging`: Represents the staging environment.
 */
export enum WebsiteStage {
  Prod = 'prod',
  Staging = 'staging',
}

/**
 * Validates whether the given website stage is valid or not.
 *
 * @param {WebsiteStage} stage - The website stage to be validated.
 * @returns {boolean} - True if the stage is valid; otherwise, false.
 */
export function validateWebsiteStage(stage: WebsiteStage): boolean {
  return [WebsiteStage.Prod, WebsiteStage.Staging].includes(stage);
}

/**
 * A class representing the environment configuration for an application.
 *
 * This class is responsible for retrieving environment variable values,
 * validating them using a schema, and storing them as properties for use
 * within the application. It includes configurations for AWS, DynamoDB,
 * and React-related parameters, among others.
 *
 * Usage of this class assumes all required environment variables are set
 * and validation passes during initialization.
 */
@injectable()
export class EnvConfigDefault {
  /**
   * Represents the list of website environments.
   *
   * @type {string[]}
   * @name websiteEnvironments
   */
  public websiteEnvironments: string[] = [
    WebsiteStage.Prod,
    WebsiteStage.Staging,
  ];

  /**
   * Represents a bundle containing configuration or state information.
   * @typedef {Object} bundle
   * @property {string} stage - A string representing the current stage or phase of a process.
   */
  public readonly bundle: {
    stage?: Nullable<string>;
    provider?: Nullable<string>;
    debug?: Nullable<string>;
  };

  /**
   * Represents the local directory path where build artifacts are stored.
   * This variable contains a string that specifies the directory
   * relative to the local file system. It is used to organize and
   * locate build outputs during the build process.
   */
  public readonly localBuildDir: Maybe<string>;

  /**
   * Defaults configuration object.
   *
   * @property {Object} defaults.aws - Configuration related to AWS integration.
   * @property {Object} defaults.aws.cdk - Configuration for AWS CDK.
   * @property {?string} defaults.aws.cdk.cdkDefaultAccount - Default AWS account used by CDK. Can be null or omitted.
   * @property {?string} defaults.aws.cdk.cdkDefaultRegion - Default AWS region used by CDK. Can be null or omitted.
   * @property {?string} defaults.aws.region - Default AWS region. Can be null or omitted.
   * @property {?string} defaults.aws.accessKeyId - AWS Access Key ID for authentication. Can be null or omitted.
   * @property {?string} defaults.aws.awsSecretAccessKey - AWS Secret Access Key for authentication. Can be null or omitted.
   * @property {?string} defaults.aws.awsSessionToken - AWS Session Token for authentication. Can be null or omitted.
   */
  public readonly defaults: {
    aws: {
      cdk: {
        cdkDefaultAccount?: Nullable<string>;
        cdkDefaultRegion?: Nullable<string>;
      },
      credentials: {
        region: string;
        accessKeyId?: Maybe<Nullable<string>>
        awsSecretAccessKey?: Maybe<Nullable<string>>;
        awsSessionToken?: Nullable<string>;
      }
    }
  };

  /**
   * Represents the result of a validation operation using Zod schema.
   * The validationResult contains information indicating whether the input
   * data matches the specified validation schema and any errors encountered
   * during the validation process.
   *
   * The variable can be either:
   * - A successful result containing the parsed data conforming to the schema.
   * - An error result containing details about validation errors.
   *
   * This is specifically useful when working with Zod's schema-safe validation
   * process for parsing and verifying input data integrity.
   */
  protected validationResult: ZodSafeParseResult<z.infer<any>>;

  /**
   * Represents the default environment configuration object.
   * This variable is used to define and store the default settings
   * for the application's environment configuration schema.
   *
   * The defaultEnv object serves as a baseline configuration,
   * which can be overridden or extended based on specific
   * environment requirements or runtime parameters.
   *
   * @type {EnvConfigSchemaDefault}
   */
  protected defaultEnv: EnvConfigSchemaDefault;

  /**
   * A string variable that holds the value 'dump'.
   * This variable may be used for purposes such as defining or referencing
   * a specific credential type or identifier within a system.
   *
   * @todo: can be performed by external env resource or internal setting
   */
  protected dumpCredential: string = 'dump';

  /**
   * Constructs a new instance of the class.
   *
   * Retrieves configuration values from the environment variables, validates them, and sets them as properties.
   *
   * @throws {ZodError} - If the validation of environment variables fails.
   */
  constructor(support?: boolean) {
    // @todo: rename to defaults, or similar naming, defaultEnv -- stupid naming
    this.defaultEnv = {
      bundle: {
        STAGE: process.env.STAGE ?? STAGE_DEFAULT,
        PROVIDER: process.env.PROVIDER,
        DEBUG: process.env.DEBUG,
      },
      aws: {
        cdk: {
          CDK_DEFAULT_ACCOUNT: process.env.CDK_DEFAULT_ACCOUNT,
          CDK_DEFAULT_REGION: process.env.CDK_DEFAULT_REGION,
        },
        credentials: {
          AWS_REGION: process.env.AWS_REGION ? process.env.AWS_REGION : 'us-east-1',
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID : support ? this.dumpCredential : this.dumpCredential,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? process.env.AWS_SECRET_ACCESS_KEY : support ? this.dumpCredential : this.dumpCredential,
          AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN ? process.env.AWS_SESSION_TOKEN : support ? this.dumpCredential : this.dumpCredential,
        }
      },
    };
    const envConfigSchema = support
      ? envConfigSchemaSupport
      : envConfigSchemaDefault;
    this.validationResult = envConfigSchema.safeParse(this.defaultEnv);

    if (!this.validationResult.success) {
      throw new ZodError(this.validationResult.error.issues);
    }

    this.bundle = {
      stage: this.validationResult.data.bundle?.STAGE,
      provider: this.validationResult.data.bundle?.PROVIDER,
      debug: this.validationResult.data.bundle?.DEBUG,
    };

    this.defaults = {
      aws: {
        cdk: {
          cdkDefaultAccount: this.validationResult.data.aws?.cdk?.CDK_DEFAULT_ACCOUNT,
          cdkDefaultRegion: this.validationResult.data.aws?.cdk?.CDK_DEFAULT_REGION,
        },
        credentials: {
          region: this.validationResult.data.aws?.credentials?.AWS_REGION ?? DEFAULT_AWS_REGION,
          accessKeyId: this.validationResult.data.aws?.credentials?.AWS_ACCESS_KEY_ID,
          awsSecretAccessKey: this.validationResult.data.aws?.credentials?.AWS_SECRET_ACCESS_KEY,
          awsSessionToken: this.validationResult.data.aws?.credentials?.AWS_SESSION_TOKEN,
        },
      },
    };
  }

  /**
   * Checks if AWS credentials contain the value 'dump' within accessKeyId, awsSecretAccessKey, or awsSessionToken.
   *
   * @return {boolean} True if any of the AWS credentials include the value 'dump', otherwise false.
   */
  public isAwsCredentialsDump(): boolean {
    return [
      this.defaults.aws.credentials.accessKeyId,
      this.defaults.aws.credentials.awsSecretAccessKey,
    ].includes(this.dumpCredential);
  }

  // public awsCredentialsDump() {
  //   if (!this.defaultEnv.aws) {
  //     console.log('[ERROR] AWS Credentials configuration is invalid or missing. Please check your environment configuration.');
  //   } else {
  //     // if ([Object.values(this.defaultEnv.aws.credentials).filter((credential: string | null) => credential !== null).map((credential: string | string[]) => credential.j)].includes('dump')) {
  //     if () {
  //
  //     }
  //   }
  //   return this.defaults.aws.credentials;
  // }

  /**
   * Updates the environment configuration by validating it against a provided schema.
   * If the validation fails, an error is thrown.
   *
   * @param {Object} config - The configuration object.
   * @param {any} config.env - The environment data to be validated and set.
   * @param {any} config.schema - The validation schema to validate the environment data against.
   * @return {void} Returns nothing if the environment setting is successful.
   * @throws {ZodError} Throws an error if the validation of the environment data fails.
   */
  public setEnv({ env, schema }: EnvSchemaDescriptor): void {
    const validationResult: ZodSafeParseResult<EnvSchemaDescriptorValues> =
      schema.safeParse(env);

    if (!validationResult.success) {
      throw new ZodError(validationResult.error.issues);
    }

    this.defaultEnv = {
      ...this.defaultEnv,
      ...validationResult.data,
    };
  }
}
