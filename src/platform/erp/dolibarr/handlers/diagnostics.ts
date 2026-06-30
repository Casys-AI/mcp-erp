import type {
  ErpToolCallContext,
  ErpToolCallResult,
  ErpToolDefinition,
} from "../../../../domain/adapter.ts";
import type { ErpConnection } from "../../../../domain/connection.ts";

type DolibarrConnection = Extract<ErpConnection, { erpType: "dolibarr" }>;

export async function callDolibarrDiagnosticsTool(
  params: {
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly connection: DolibarrConnection;
    readonly ctx: ErpToolCallContext;
    readonly tools: readonly ErpToolDefinition[];
  },
): Promise<ErpToolCallResult | undefined> {
  if (params.name !== "dolibarr.ping") return undefined;
  rejectUnsupportedArguments(params.name, params.args);

  return await Promise.resolve({
    content: {
      ok: true,
      erpType: "dolibarr",
      apiUrl: params.connection.apiUrl,
      sandbox: params.connection.sandbox,
      tenantId: params.ctx.tenantId,
      actorSubject: params.ctx.actorSubject,
      toolCount: params.tools.length,
      toolNames: params.tools.map((tool) => tool.name),
    },
    summary: `Dolibarr connection check — apiUrl=${params.connection.apiUrl}`,
  });
}

function rejectUnsupportedArguments(
  toolName: string,
  args: Record<string, unknown>,
): void {
  const unsupported = Object.keys(args);
  if (unsupported.length > 0) {
    throw new TypeError(
      `${toolName} does not support argument(s): ${unsupported.join(", ")}`,
    );
  }
}
