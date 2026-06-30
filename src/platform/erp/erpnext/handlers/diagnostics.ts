import type {
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "../../../../domain/adapter.ts";
import type { ErpConnection } from "../../../../domain/connection.ts";

type ErpnextConnection = Extract<ErpConnection, { erpType: "erpnext" }>;

export async function callErpnextDiagnosticsTool(
  params: {
    readonly name: string;
    readonly connection: ErpnextConnection;
    readonly ctx: ErpToolCallContext;
    readonly tools: readonly ErpToolDefinition[];
  },
): Promise<ErpToolCallResult | undefined> {
  if (params.name !== "erpnext.ping") return undefined;

  return await Promise.resolve({
    content: {
      ok: true,
      erpType: "erpnext",
      apiUrl: params.connection.apiUrl,
      sandbox: params.connection.sandbox,
      tenantId: params.ctx.tenantId,
      actorSubject: params.ctx.actorSubject,
      toolCount: params.tools.length,
      toolNames: params.tools.map((tool) => tool.name),
    },
    summary:
      `ERPNext connection check — apiUrl=${params.connection.apiUrl} sandbox=${params.connection.sandbox}`,
  });
}
