/**
 * Reusable MCP Apps viewer registration for @casys/mcp-erp.
 *
 * Viewers are built single-file HTML bundles. The first list/detail viewers
 * are copied from mcp-erpnext, while diagnostics is package-native. The
 * namespace is `ui://mcp-erp/*` so hosts can register them independently from
 * the single-ERP mcp-erpnext server.
 *
 * @module @casys/mcp-erp/viewers
 */

import type { McpApp } from "@casys/mcp-server";
import type { ErpToolMeta } from "../../domain/adapter.ts";

const MODULE_URL = new URL("../../../", import.meta.url).href;

export const ERP_VIEWERS = [
  "doclist-viewer",
  "invoice-viewer",
  "diagnostics-viewer",
  "detail-viewer",
] as const;

export type ErpViewerName = (typeof ERP_VIEWERS)[number];

const viewerHtmlCache = new Map<string, string>();

export interface ErpViewerFilesystem {
  exists(path: string): boolean;
  readFile(path: string): string | Promise<string>;
}

interface DenoLikeFilesystem {
  statSync(path: string): unknown;
  readTextFile(path: string): Promise<string>;
}

function viewer(name: ErpViewerName): ErpToolMeta {
  return {
    ui: {
      resourceUri: `ui://mcp-erp/${name}`,
    },
  };
}

export const ERP_DOCLIST_META: ErpToolMeta = viewer("doclist-viewer");
export const ERP_INVOICE_META: ErpToolMeta = viewer("invoice-viewer");
export const ERP_DIAGNOSTICS_META: ErpToolMeta = viewer("diagnostics-viewer");
export const ERP_DETAIL_META: ErpToolMeta = viewer("detail-viewer");

function isRemoteUrl(path: string): boolean {
  return path.startsWith("https://") || path.startsWith("http://");
}

export function registerErpViewers(
  app: McpApp,
  fs: ErpViewerFilesystem = defaultViewerFilesystem(),
): { registered: string[]; skipped: string[] } {
  return app.registerViewers({
    prefix: "mcp-erp",
    moduleUrl: MODULE_URL,
    viewers: [...ERP_VIEWERS],
    exists: fs.exists,
    readFile: async (path: string): Promise<string> => {
      if (isRemoteUrl(path)) {
        const cached = viewerHtmlCache.get(path);
        if (cached) return cached;
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ERP viewer HTML: ${path} (${response.status})`,
          );
        }
        const html = await response.text();
        viewerHtmlCache.set(path, html);
        return html;
      }
      return await fs.readFile(path);
    },
  });
}

function defaultViewerFilesystem(): ErpViewerFilesystem {
  const deno = (globalThis as unknown as { Deno?: DenoLikeFilesystem }).Deno;
  return {
    exists(path: string): boolean {
      if (isRemoteUrl(path)) return true;
      if (!deno) return false;
      try {
        deno.statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    readFile(path: string): Promise<string> {
      if (!deno) {
        throw new Error(
          "registerErpViewers needs filesystem callbacks outside Deno",
        );
      }
      return deno.readTextFile(path);
    },
  };
}
