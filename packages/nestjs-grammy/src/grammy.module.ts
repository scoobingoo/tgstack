import { type DynamicModule, Module, type Provider } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import type { Context } from "grammy";
import { GRAMMY_MODULE_OPTIONS } from "./grammy.constants.js";
import { coreExports, coreProviders } from "./grammy-core.module.js";
import { resolveGrammyOptions } from "./grammy-options.js";
import type {
  GrammyModuleAsyncOptions,
  GrammyModuleOptions,
  GrammyOptionsFactory,
} from "./interfaces/grammy-options.interface.js";

const RAW_OPTIONS = Symbol("GRAMMY_RAW_OPTIONS");

/**
 * grammY integration for NestJS.
 *
 * ```ts
 * @Module({ imports: [GrammyModule.forRoot({ token: process.env.BOT_TOKEN! })] })
 * export class AppModule {}
 * ```
 *
 * The module is global: `@InjectBot()` works in every module once it is imported.
 */
@Module({})
export class GrammyModule {
  static forRoot<C extends Context = Context>(options: GrammyModuleOptions<C>): DynamicModule {
    return {
      module: GrammyModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        { provide: GRAMMY_MODULE_OPTIONS, useValue: resolveGrammyOptions(options) },
        ...coreProviders,
      ],
      exports: coreExports,
    };
  }

  static forRootAsync<C extends Context = Context>(
    options: GrammyModuleAsyncOptions<C>,
  ): DynamicModule {
    return {
      module: GrammyModule,
      global: true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        ...createAsyncOptionsProviders(options),
        {
          provide: GRAMMY_MODULE_OPTIONS,
          useFactory: (raw: GrammyModuleOptions<C>) => resolveGrammyOptions(raw),
          inject: [RAW_OPTIONS],
        },
        ...(options.extraProviders ?? []),
        ...coreProviders,
      ],
      exports: coreExports,
    };
  }
}

function createAsyncOptionsProviders<C extends Context>(
  options: GrammyModuleAsyncOptions<C>,
): Provider[] {
  if (options.useFactory) {
    return [{ provide: RAW_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] }];
  }
  const factoryClass = options.useClass ?? options.useExisting;
  if (!factoryClass) {
    throw new Error(
      "GrammyModule.forRootAsync: provide `useFactory`, `useClass` or `useExisting`.",
    );
  }
  const raw: Provider = {
    provide: RAW_OPTIONS,
    useFactory: (factory: GrammyOptionsFactory<C>) => factory.createGrammyOptions(),
    inject: [factoryClass],
  };
  return options.useClass
    ? [raw, { provide: options.useClass, useClass: options.useClass }]
    : [raw];
}
