// Shrinks a `pnpm deploy --prod` output for the runtime image.
//   node prune-node-modules.mjs /out/server
//
// 1. Keeps only packages reachable from the app's package.json through
//    `dependencies` / `optionalDependencies`. pnpm also installs *peer*
//    dependencies — that is how the Prisma CLI, its engines and Prisma Studio
//    (~150 MB) end up next to `@prisma/client` — and nothing loads them at runtime.
// 2. Drops the Prisma query compilers for databases other than PostgreSQL,
//    source maps and type declarations.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

const appDir = path.resolve(process.argv[2] ?? ".");
const store = path.join(appDir, "node_modules/.pnpm");

function findPackage(fromDir, name) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    if (path.dirname(dir) === dir) return undefined;
  }
}

const keep = new Set();
const queue = [appDir];
while (queue.length > 0) {
  const dir = queue.pop();
  if (keep.has(dir)) continue;
  keep.add(dir);
  const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    const found = findPackage(dir, name);
    if (found) queue.push(found);
  }
}

let removed = 0;
for (const entry of readdirSync(store)) {
  const modules = path.join(store, entry, "node_modules");
  if (!existsSync(modules)) continue;
  const packages = readdirSync(modules).flatMap((name) =>
    name.startsWith("@")
      ? readdirSync(path.join(modules, name)).map((sub) => path.join(modules, name, sub))
      : [path.join(modules, name)],
  );
  // The package of this store entry is the real directory; its dependencies are symlinks.
  const own = packages.filter((p) => !lstatSync(p).isSymbolicLink());
  if (own.length > 0 && own.every((p) => !keep.has(realpathSync(p)))) {
    rmSync(path.join(store, entry), { recursive: true, force: true });
    removed++;
  }
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (!existsSync(full)) rmSync(full, { force: true }); // dangling after the pruning above
    } else if (entry.isDirectory()) {
      walk(full, visit);
    } else {
      visit(full);
    }
  }
}

let files = 0;
let bytes = 0;
walk(path.join(appDir, "node_modules"), (file) => {
  const base = path.basename(file);
  const otherDatabase =
    /^query_compiler_(fast|small)_bg\./.test(base) && !base.includes("_fast_bg.postgresql.");
  if (
    otherDatabase ||
    /\.(map|d\.ts|d\.mts|d\.cts)$/.test(base) ||
    /^wasm-compiler-edge\./.test(base)
  ) {
    bytes += statSync(file).size;
    rmSync(file);
    files++;
  }
});

console.log(
  `pruned ${removed} unreachable packages and ${files} files (${Math.round(bytes / 1e6)} MB); kept ${keep.size - 1} packages`,
);
