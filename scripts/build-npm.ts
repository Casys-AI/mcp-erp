/**
 * Build script for @casys/mcp-erp npm package.
 *
 * Uses dnt (Deno to Node Transform) to produce ESM + CJS + type declarations
 * from the Deno source.
 *
 * Usage:
 *   deno run -A scripts/build-npm.ts
 */

import { build, emptyDir } from "@deno/dnt";

const denoJsonText = await Deno.readTextFile(
  new URL("../deno.json", import.meta.url),
);
const denoJson = JSON.parse(denoJsonText) as {
  name?: string;
  version?: string;
  description?: string;
};
const VERSION = denoJson.version;
const DESCRIPTION = denoJson.description;
if (!VERSION) {
  throw new Error("[build-npm] failed to read version from deno.json");
}
if (!DESCRIPTION) {
  throw new Error("[build-npm] failed to read description from deno.json");
}
console.log(`[build-npm] Version: ${VERSION}`);

await emptyDir("./dist-node");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./dist-node",
  shims: {
    deno: false,
  },
  package: {
    name: "@casys/mcp-erp",
    version: VERSION,
    description: DESCRIPTION,
    license: "MIT",
    repository: {
      type: "git",
      url: "https://github.com/Casys-AI/mcp-erp",
    },
    keywords: [
      "mcp",
      "model-context-protocol",
      "erp",
      "erpnext",
      "dolibarr",
      "tunnel",
    ],
  },
  compilerOptions: {
    lib: ["ES2022", "DOM"],
    target: "ES2022",
  },
  // The package root is runtime-agnostic. Deno-first local-agent exports stay
  // JSR-only, so npm generation intentionally skips full DNT type-checking.
  typeCheck: false,
  test: false,
  importMap: "./deno.json",
});

// Patch package.json: add "types" field and types conditions in exports
// for broader TypeScript compatibility (moduleResolution: node, bundler, etc.)
const pkgPath = "dist-node/package.json";
const pkg = JSON.parse(await Deno.readTextFile(pkgPath));
pkg.types = "./esm/mod.d.ts";
pkg.exports = {
  ".": {
    types: "./esm/mod.d.ts",
    import: "./esm/mod.js",
    require: "./script/mod.js",
  },
};
await Deno.writeTextFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

await smokeTestRootExport();

console.log("\n[build-npm] Done. Output in ./dist-node/");

async function smokeTestRootExport(): Promise<void> {
  const tempConsumer = await Deno.makeTempDir({
    prefix: "mcp-erp-npm-smoke-",
  });
  try {
    const packageScope = `${tempConsumer}/node_modules/@casys`;
    await Deno.mkdir(packageScope, { recursive: true });
    await Deno.symlink(
      new URL("../dist-node", import.meta.url).pathname,
      `${packageScope}/mcp-erp`,
      { type: "dir" },
    );
    const command = new Deno.Command("node", {
      cwd: tempConsumer,
      args: [
        "--input-type=module",
        "--eval",
        [
          "const mod = await import('@casys/mcp-erp');",
          "if (typeof mod.buildAdapter !== 'function') {",
          "  throw new Error('buildAdapter export missing');",
          "}",
        ].join("\n"),
      ],
    });
    const result = await command.output();
    if (!result.success) {
      const stderr = new TextDecoder().decode(result.stderr).trim();
      const stdout = new TextDecoder().decode(result.stdout).trim();
      throw new Error(
        [
          "[build-npm] npm root export smoke test failed",
          stdout && `stdout:\n${stdout}`,
          stderr && `stderr:\n${stderr}`,
        ].filter(Boolean).join("\n"),
      );
    }
  } finally {
    await Deno.remove(tempConsumer, { recursive: true });
  }
}
