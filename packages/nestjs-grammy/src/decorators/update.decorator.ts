import { applyDecorators, Injectable, SetMetadata } from "@nestjs/common";
import { UPDATE_METADATA } from "../grammy.constants.js";

/**
 * Marks a provider as a container of bot handlers (`@Command()`, `@On()`, …).
 * The class must be registered as a provider of a module, like any other provider.
 * Handlers of every `@Update()` class are registered in module discovery order,
 * then in method declaration order.
 */
export function Update(): ClassDecorator {
  return applyDecorators(Injectable(), SetMetadata(UPDATE_METADATA, true));
}
