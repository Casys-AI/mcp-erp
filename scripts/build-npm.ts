/**
 * Build script for @casys/mcp-erp npm package.
 *
 * Uses dnt (Deno to Node Transform) to produce ESM + CJS + type declarations
 * from the Deno source, then post-processes the output to make it runnable on
 * Node.js by replacing the Deno-specific runtime inlined from @casys/mcp-server.
 *
 * Post-processing steps (in order after dnt build):
 *   1. copyViewerDistToNpm  — bundle UI assets if present
 *   2. patchMcpServerRuntime — swap Deno runtime.js with the upstream Node
 *      runtime.ts (from the npm-installed package matching the inlined JSR
 *      version, integrity-verified by npm against the registry), transpiled
 *      to ESM and CJS via esbuild
 *   3. smokeTestRootExport  — Node smoke tests (ESM + CJS) covering the
 *      adapter path, getFetchHandler, startHttp, and createErpRemoteApp.
 *      Build fails if any smoke fails.
 *
 * Usage:
 *   deno run -A scripts/build-npm.ts
 *
 * Node.js note:
 *   Both startHttp() and getFetchHandler() work on Node. The npm build
 *   replaces Deno.serve with a node:http adapter. See README for guidance.
 */

// deno-lint-ignore-file no-explicit-any
import { build, emptyDir } from "@deno/dnt";
import * as esbuild from "esbuild";

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
      "mcp-server",
      "stdio",
      "http",
    ],
  },
  compilerOptions: {
    lib: ["ES2022", "DOM"],
    target: "ES2022",
  },
  // The package root is runtime-agnostic. The Deno `./server` CLI export stays
  // JSR-only for now because it owns Deno runtime concerns such as CLI args,
  // file reads, and signal handling.
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

await copyViewerDistToNpm();
await patchMcpServerRuntime();
// esbuild service stays alive until explicitly stopped; clean up now that
// all transforms are done (patchMcpServerRuntime was the only caller).
try {
  await esbuild.stop();
} catch {
  // ignore — esbuild.stop() is idempotent but may throw if already stopped
}
await smokeTestRootExport();

console.log("\n[build-npm] Done. Output in ./dist-node/");

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function copyViewerDistToNpm(): Promise<void> {
  const source = new URL("../src/ui/dist/", import.meta.url);
  try {
    await Deno.stat(source);
  } catch {
    return;
  }
  await copyDirectory(source, "dist-node/esm/ui-dist");
  await copyDirectory(source, "dist-node/script/ui-dist");
}

async function copyDirectory(source: URL, target: string): Promise<void> {
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const sourceChild = new URL(
      `${entry.name}${entry.isDirectory ? "/" : ""}`,
      source,
    );
    const targetChild = `${target}/${entry.name}`;
    if (entry.isDirectory) {
      await copyDirectory(sourceChild, targetChild);
      continue;
    }
    if (entry.isFile) {
      await Deno.copyFile(sourceChild, targetChild);
    }
  }
}

// Replaces the Deno-specific runtime.js inlined by DNT from @casys/mcp-server.
//
// Context: DNT inlines the Deno source of JSR dependencies verbatim. The
// mcp-server runtime module (src/runtime/runtime.ts) calls Deno.env,
// Deno.readTextFile, Deno.serve, and Deno.unrefTimer — all of which throw
// "ReferenceError: Deno is not defined" at runtime on Node.js. The upstream
// repo ships a runtime.node.ts drop-in (see build-node.sh in the mcp-server
// repo), but DNT does not know to swap it.
//
// This function:
//   1. Detects the version of @casys/mcp-server that DNT inlined
//      (from dist-node/esm/deps/jsr.io/@casys/mcp-server/<ver>/).
//   2. Installs @casys/mcp-server@<ver> via `npm install` in a temp dir.
//      npm verifies the package integrity against the registry (sha512 from
//      the registry manifest) — locked and reproducible, no unverified CDN
//      fetches. Reads src/runtime/runtime.ts from node_modules (the npm
//      package ships the Node variant because build-node.sh swaps
//      runtime.node.ts before npm publish).
//   3. Validates the obtained source does NOT contain Deno.* (confirms it is
//      the Node version, not the Deno version).
//   4. Transpiles TS -> ESM and TS -> CJS via esbuild (handles node: imports,
//      type stripping, satisfies keyword, etc. — no hand-rolled transform).
//   5. Guards the target file content: must contain "Deno." (unpatched) OR
//      our own patch header (idempotent rebuild). Throws otherwise — prevents
//      silently overwriting unexpected content.
//   6. Writes the transpiled files to both ESM and CJS output trees.
//   7. Throws if patchCount != 2 (exactly one ESM + one CJS file expected).
async function patchMcpServerRuntime(): Promise<void> {
  console.log(
    "[build-npm] patchMcpServerRuntime: detecting inlined version...",
  );

  // Step 1: detect the inlined version from the ESM output tree.
  const esmDepsRoot = "./dist-node/esm/deps/jsr.io/@casys/mcp-server";
  let versionDirs: Deno.DirEntry[];
  try {
    versionDirs = [];
    for await (const entry of Deno.readDir(esmDepsRoot)) {
      if (entry.isDirectory) versionDirs.push(entry);
    }
  } catch (err) {
    throw new Error(
      `[build-npm] patchMcpServerRuntime: deps dir not found: ${esmDepsRoot}\n` +
        `  Cause: ${String(err)}\n` +
        `  DNT may not have inlined @casys/mcp-server, or the output structure has changed.`,
    );
  }
  if (versionDirs.length === 0) {
    throw new Error(
      `[build-npm] patchMcpServerRuntime: no version subdirectory found under ${esmDepsRoot}.\n` +
        `  Expected exactly one directory (e.g. "0.18.0").`,
    );
  }
  if (versionDirs.length > 1) {
    const names = versionDirs.map((d) => d.name).join(", ");
    throw new Error(
      `[build-npm] patchMcpServerRuntime: multiple version dirs found (${names}) — ` +
        `cannot determine which to patch. Update this script to handle multiple inlined versions.`,
    );
  }
  const inlinedVersion = versionDirs[0].name; // e.g. "0.18.0"
  console.log(
    `[build-npm] patchMcpServerRuntime: inlined @casys/mcp-server version = ${inlinedVersion}`,
  );

  // Step 2: install @casys/mcp-server@{ver} in a temp dir via npm to obtain
  // src/runtime/runtime.ts. npm verifies the package integrity against the
  // registry (sha512), so the source is locked and reproducible — no unverified
  // CDN fetches in the publish path. The npm package ships the Node variant of
  // runtime.ts because build-node.sh swaps runtime.node.ts before publish.
  console.log(
    `[build-npm] patchMcpServerRuntime: npm-installing @casys/mcp-server@${inlinedVersion} (integrity-verified)...`,
  );
  const runtimeTs = await (async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "mcp-server-runtime-" });
    try {
      await Deno.writeTextFile(
        `${tmpDir}/package.json`,
        JSON.stringify({ name: "tmp", version: "0.0.0", private: true }),
      );
      const installResult = await new Deno.Command("npm", {
        cwd: tmpDir,
        args: [
          "install",
          `@casys/mcp-server@${inlinedVersion}`,
          "--no-save",
          "--prefer-offline",
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (!installResult.success) {
        const npmErr = new TextDecoder().decode(installResult.stderr).trim();
        throw new Error(
          `[build-npm] patchMcpServerRuntime: npm install @casys/mcp-server@${inlinedVersion} failed:\n${npmErr}`,
        );
      }
      const runtimeTsPath =
        `${tmpDir}/node_modules/@casys/mcp-server/src/runtime/runtime.ts`;
      try {
        return await Deno.readTextFile(runtimeTsPath);
      } catch (err) {
        throw new Error(
          `[build-npm] patchMcpServerRuntime: runtime.ts not found after npm install.\n` +
            `  Expected: ${runtimeTsPath}\n` +
            `  Cause: ${String(err)}\n` +
            `  The @casys/mcp-server npm package structure may have changed.`,
        );
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
    }
  })();
  console.log(
    `[build-npm] patchMcpServerRuntime: runtime.ts obtained from npm (integrity verified by registry).`,
  );

  // Step 3: validate it is the Node version (must NOT contain "Deno.").
  if (runtimeTs.includes("Deno.")) {
    throw new Error(
      `[build-npm] patchMcpServerRuntime: runtime.ts from npm contains "Deno." references.\n` +
        `  Package: @casys/mcp-server@${inlinedVersion}\n` +
        `  This means the npm package ships the Deno runtime instead of the Node one.\n` +
        `  Expected the npm package to have runtime.node.ts swapped in by build-node.sh.`,
    );
  }
  console.log(
    "[build-npm] patchMcpServerRuntime: runtime.ts validated (no Deno.* — confirmed Node variant).",
  );

  // Step 4: transpile TS -> ESM and TS -> CJS via esbuild.
  const HEADER =
    `// Node.js runtime — transpiled from @casys/mcp-server@${inlinedVersion} src/runtime/runtime.ts\n` +
    `// Upstream: packages/server/scripts/build-node.sh (official Node build process)\n`;

  const esmJs = HEADER +
    (await esbuild.transform(runtimeTs, {
      loader: "ts",
      format: "esm",
      platform: "node",
      target: "node18",
    })).code;

  const cjsJs = HEADER +
    (await esbuild.transform(runtimeTs, {
      loader: "ts",
      format: "cjs",
      platform: "node",
      target: "node18",
    })).code;

  // Step 5+6: guard content, write patches.
  // A target file is acceptable if it contains one of these markers:
  //   - "Deno." (unpatched Deno runtime, the expected case after a fresh DNT build)
  //   - Our own HEADER prefix (idempotent rebuild — already patched)
  const DENO_SIGNATURE = "Deno.";
  const OURS_SIGNATURE =
    `// Node.js runtime — transpiled from @casys/mcp-server@${inlinedVersion}`;
  // Also accept the old shim format from Wave 1 patch (four-function stub).
  const LEGACY_SHIM_SIGNATURE =
    "// Node.js runtime adapter — injected by build-npm.ts";

  let patched = 0;
  for (
    const [subDir, content] of [
      ["esm", esmJs],
      ["script", cjsJs],
    ] as [string, string][]
  ) {
    const runtimePath =
      `./dist-node/${subDir}/deps/jsr.io/@casys/mcp-server/${inlinedVersion}/src/runtime/runtime.js`;

    let existing: string;
    try {
      existing = await Deno.readTextFile(runtimePath);
    } catch (err) {
      throw new Error(
        `[build-npm] patchMcpServerRuntime: expected runtime.js not found: ${runtimePath}\n` +
          `  Cause: ${String(err)}\n` +
          `  The inlined @casys/mcp-server directory structure may have changed.`,
      );
    }

    const isDeno = existing.includes(DENO_SIGNATURE);
    const isOurs = existing.includes(OURS_SIGNATURE);
    const isLegacy = existing.includes(LEGACY_SHIM_SIGNATURE);
    if (!isDeno && !isOurs && !isLegacy) {
      throw new Error(
        `[build-npm] patchMcpServerRuntime: ${runtimePath} has unexpected content.\n` +
          `  Expected: "Deno." (unpatched) OR our patch header (idempotent rebuild).\n` +
          `  First 150 chars: ${existing.slice(0, 150).replace(/\n/g, "\\n")}`,
      );
    }

    await Deno.writeTextFile(runtimePath, content);
    console.log(`[build-npm] patchMcpServerRuntime: patched ${runtimePath}`);
    patched++;
  }

  // Step 7: hard-fail if count is wrong.
  if (patched !== 2) {
    throw new Error(
      `[build-npm] patchMcpServerRuntime: expected exactly 2 patched files (esm + script), got ${patched}.\n` +
        `  This is a bug in the patching loop — investigate.`,
    );
  }

  console.log(
    `[build-npm] patchMcpServerRuntime: done (${patched} files replaced with Node runtime from @casys/mcp-server@${inlinedVersion}).`,
  );
}

// Runs Node.js smoke tests against the built dist-node/.
//
// Covers:
//   - ESM (import()): buildAdapter export, createErpMcpApp -> getFetchHandler
//     -> tools/list, createErpRemoteApp -> getFetchHandler -> tools/list
//   - CJS (require()): createErpMcpApp -> getFetchHandler -> tools/list
//
// All stdout/stderr from Node subprocesses is printed for build log visibility.
// The build fails immediately if any smoke fails.
async function smokeTestRootExport(): Promise<void> {
  console.log("\n[build-npm] smoke tests starting...");
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

    // ── ESM smoke ─────────────────────────────────────────────────────────
    // Tests: buildAdapter export, createErpMcpApp -> getFetchHandler,
    //        createErpRemoteApp -> getFetchHandler (both tools/list).
    const ESM_SCRIPT = [
      "const mod = await import('@casys/mcp-erp');",
      "",
      "// 1. Adapter primitives",
      "if (typeof mod.buildAdapter !== 'function')",
      "  throw new Error('buildAdapter export missing');",
      "console.log('[smoke-esm] buildAdapter: OK');",
      "",
      "// 2. createErpMcpApp -> getFetchHandler -> tools/list",
      "const stubAdapter = {",
      "  erpType: 'erpnext',",
      "  tools: () => [],",
      "  callTool: async () => ({ content: [{ type: 'text', text: 'stub' }] }),",
      "};",
      "const app = mod.createErpMcpApp({ adapter: stubAdapter, tenantId: 'smoke-esm' });",
      "const handler = await app.getFetchHandler();",
      "if (typeof handler !== 'function')",
      "  throw new Error('createErpMcpApp: getFetchHandler() not a function, got: ' + typeof handler);",
      "const resp = await handler(new Request('http://localhost/mcp', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),",
      "}));",
      "const json = await resp.json();",
      "if (!Array.isArray(json.result?.tools))",
      "  throw new Error('createErpMcpApp tools/list: unexpected response: ' + JSON.stringify(json).slice(0, 200));",
      "console.log('[smoke-esm] createErpMcpApp getFetchHandler: OK (HTTP', resp.status + ', tools:', json.result.tools.length + ')');",
      "",
      "// 3. createErpRemoteApp -> getFetchHandler -> tools/list",
      "const remoteApp = mod.createErpRemoteApp({",
      "  connectionProvider: { getConnection: async (id) => ({",
      "    erpType: 'erpnext', apiUrl: 'http://erp.test',",
      "    apiKey: 'k', apiSecret: 's', tenantId: id,",
      "  })},",
      "  tenantResolver: undefined,",
      "  name: 'smoke-remote',",
      "});",
      "const remoteHandler = await remoteApp.getFetchHandler();",
      "if (typeof remoteHandler !== 'function')",
      "  throw new Error('createErpRemoteApp: getFetchHandler() not a function');",
      "const remoteResp = await remoteHandler(new Request('http://localhost/mcp', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),",
      "}));",
      "const remoteJson = await remoteResp.json();",
      "if (!Array.isArray(remoteJson.result?.tools))",
      "  throw new Error('createErpRemoteApp tools/list: unexpected response: ' + JSON.stringify(remoteJson).slice(0, 200));",
      "console.log('[smoke-esm] createErpRemoteApp getFetchHandler: OK (HTTP', remoteResp.status + ', tools:', remoteJson.result.tools.length + ')');",
      "",
      "// 4. startHttp -> port bind -> tools/list -> shutdown",
      "// Proves Deno.serve is replaced by node:http in the patched runtime.",
      "const { createServer: createNetServer } = await import('node:net');",
      "const freePort = await new Promise((res, rej) => {",
      "  const probe = createNetServer();",
      "  probe.listen(0, () => { const p = probe.address().port; probe.close(() => res(p)); });",
      "  probe.on('error', rej);",
      "});",
      "const startHttpApp = mod.createErpMcpApp({ adapter: stubAdapter, tenantId: 'smoke-starthttp' });",
      "let srvHandle;",
      "await new Promise((readyResolve, readyReject) => {",
      "  startHttpApp.startHttp({ port: freePort, onListen: readyResolve, requireAuth: false })",
      "    .then(h => { srvHandle = h; })",
      "    .catch(readyReject);",
      "});",
      "const startHttpResp = await fetch('http://localhost:' + freePort + '/mcp', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }),",
      "});",
      "const startHttpJson = await startHttpResp.json();",
      "if (!Array.isArray(startHttpJson.result?.tools))",
      "  throw new Error('startHttp tools/list: unexpected: ' + JSON.stringify(startHttpJson).slice(0, 200));",
      "console.log('[smoke-esm] startHttp OK (HTTP', startHttpResp.status + ', port', freePort + ', tools:', startHttpJson.result.tools.length + ')');",
      "await srvHandle.shutdown();",
    ].join("\n");

    await runNodeSmoke(tempConsumer, "ESM", {
      args: ["--input-type=module", "--eval", ESM_SCRIPT],
    });

    // ── CJS smoke ─────────────────────────────────────────────────────────
    // Tests: createErpMcpApp -> getFetchHandler -> tools/list via require().
    const CJS_SCRIPT = [
      '"use strict";',
      "const { createErpMcpApp } = require('@casys/mcp-erp');",
      "const stubAdapter = {",
      "  erpType: 'erpnext',",
      "  tools: () => [],",
      "  callTool: async () => ({ content: [{ type: 'text', text: 'stub' }] }),",
      "};",
      "(async () => {",
      "  const app = createErpMcpApp({ adapter: stubAdapter, tenantId: 'smoke-cjs' });",
      "  const handler = await app.getFetchHandler();",
      "  if (typeof handler !== 'function')",
      "    throw new Error('CJS getFetchHandler() not a function, got: ' + typeof handler);",
      "  const resp = await handler(new Request('http://localhost/mcp', {",
      "    method: 'POST',",
      "    headers: { 'Content-Type': 'application/json' },",
      "    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),",
      "  }));",
      "  const json = await resp.json();",
      "  if (!Array.isArray(json.result?.tools))",
      "    throw new Error('CJS tools/list: unexpected response: ' + JSON.stringify(json).slice(0, 200));",
      "  process.stdout.write('[smoke-cjs] createErpMcpApp getFetchHandler: OK (HTTP ' + resp.status + ', tools: ' + json.result.tools.length + ')\\n');",
      "})().catch(err => {",
      "  process.stderr.write('[smoke-cjs] FAILED: ' + err.message + '\\n' + (err.stack || '') + '\\n');",
      "  process.exit(1);",
      "});",
    ].join("\n");

    // Write .cjs file so Node uses CommonJS mode regardless of package type.
    const cjsFile = `${tempConsumer}/smoke.cjs`;
    await Deno.writeTextFile(cjsFile, CJS_SCRIPT);
    await runNodeSmoke(tempConsumer, "CJS", { args: [cjsFile] });
  } finally {
    await Deno.remove(tempConsumer, { recursive: true });
  }
  console.log("[build-npm] smoke tests: all PASSED\n");
}

async function runNodeSmoke(
  cwd: string,
  label: string,
  opts: { args: string[] },
): Promise<void> {
  const command = new Deno.Command("node", {
    cwd,
    args: opts.args,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();

  const stdout = new TextDecoder().decode(result.stdout).trimEnd();
  const stderr = new TextDecoder().decode(result.stderr).trimEnd();

  // Always print subprocess output for build log visibility.
  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  if (!result.success) {
    throw new Error(
      `[build-npm] smoke test ${label} FAILED (node exit code ${result.code})`,
    );
  }
  console.log(`[build-npm] smoke ${label}: PASS`);
}
