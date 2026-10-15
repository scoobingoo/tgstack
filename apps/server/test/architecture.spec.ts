import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture rules from docs/architecture.md, checked on every test run so a
 * refactor cannot quietly break them.
 */
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const serverSrc = path.join(repoRoot, "apps/server/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === "dist" || entry === "generated") return [];
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts") ? [full] : [];
  });
}

/** Import specifiers of a file: `from "x"`, `import("x")`, `import "x"`. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
}

/** Resolved server-relative targets ("modules/users/users.service.ts") of a server file. */
function serverImports(file: string): string[] {
  return importsOf(file)
    .filter((spec) => spec.startsWith("."))
    .map((spec) =>
      path
        .relative(serverSrc, path.resolve(path.dirname(file), spec))
        .split(path.sep)
        .join("/"),
    );
}

const rel = (file: string) => path.relative(serverSrc, file).split(path.sep).join("/");
const server = sourceFiles(serverSrc);
const layer = (pathInSrc: string) => pathInSrc.split("/")[0] ?? "";

function violations(files: string[], isForbidden: (target: string) => boolean): string[] {
  return files.flatMap((file) =>
    serverImports(file)
      .filter(isForbidden)
      .map((target) => `${rel(file)} → ${target}`),
  );
}

describe("package boundaries", () => {
  const packageImports = (dir: string) =>
    sourceFiles(path.join(repoRoot, dir)).flatMap((file) =>
      importsOf(file).map((spec) => ({ file: path.relative(repoRoot, file), spec })),
    );

  it("@tgstack/nestjs-grammy only depends on NestJS and grammY (it is published alone)", () => {
    const external = packageImports("packages/nestjs-grammy/src")
      .filter(({ spec }) => !spec.startsWith("."))
      .filter(
        ({ spec }) => !/^(@nestjs\/|grammy|@grammyjs\/|node:|rxjs|reflect-metadata)/.test(spec),
      );
    expect(external).toEqual([]);
  });

  it("@tgstack/shared is isomorphic: zod and relative imports only", () => {
    const external = packageImports("packages/shared/src").filter(
      ({ spec }) => !spec.startsWith(".") && spec !== "zod",
    );
    expect(external).toEqual([]);
  });

  it.each(["apps/admin/src", "apps/miniapp/src"])(
    "%s never imports the database or server code",
    (dir) => {
      const forbidden = packageImports(dir).filter(
        ({ spec }) =>
          spec.startsWith("@tgstack/db") ||
          spec.startsWith("@tgstack/nestjs-grammy") ||
          spec.includes("apps/server") ||
          spec.includes("../server"),
      );
      expect(forbidden).toEqual([]);
    },
  );
});

describe("server layers", () => {
  it("config/ and infra/ do not depend on features", () => {
    const files = server.filter((file) => ["config", "infra"].includes(layer(rel(file))));
    expect(violations(files, (target) => !["config", "infra"].includes(layer(target)))).toEqual([]);
  });

  it("bot/ only reaches into modules/ for the user identity", () => {
    const files = server.filter((file) => layer(rel(file)) === "bot");
    expect(
      violations(
        files,
        (target) =>
          ["modules", "examples"].includes(layer(target)) && !target.startsWith("modules/users/"),
      ),
    ).toEqual([]);
  });

  it("examples/ can be deleted: only app.module.ts imports them", () => {
    const files = server.filter(
      (file) => layer(rel(file)) !== "examples" && rel(file) !== "app.module.ts",
    );
    expect(violations(files, (target) => layer(target) === "examples")).toEqual([]);
  });

  it("every example file is marked // EXAMPLE:", () => {
    const unmarked = [
      ...sourceFiles(path.join(serverSrc, "examples")),
      ...sourceFiles(path.join(repoRoot, "apps/miniapp/src/pages/shop")),
    ].filter((file) => !readFileSync(file, "utf8").includes("EXAMPLE:"));
    expect(unmarked.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });

  it("the API process never registers queue processors", () => {
    const importers = server.filter((file) =>
      serverImports(file).some((target) =>
        /broadcasts-worker\.module\.js$|\.processor\.js$/.test(target),
      ),
    );
    // Only files that belong to the worker process (main.worker.ts) may load processors.
    expect(importers.map(rel).sort()).toEqual([
      "modules/broadcasts/broadcasts-worker.module.ts",
      "worker-heartbeat.ts",
      "worker.module.ts",
    ]);
    const appModuleImports = serverImports(path.join(serverSrc, "app.module.ts"));
    expect(appModuleImports.filter((target) => /^worker/.test(target))).toEqual([]);
  });
});

describe("HTTP namespaces", () => {
  it("every controller is guarded by its namespace decorator", () => {
    const publicControllers = new Set([
      "modules/auth/auth.controller.ts",
      "infra/health/health.controller.ts",
    ]);
    const unguarded = server
      .filter((file) => file.endsWith(".controller.ts") && !publicControllers.has(rel(file)))
      .filter((file) => !/@(AdminController|MiniAppController)\(/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(unguarded).toEqual([]);
  });
});
