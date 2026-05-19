import type { ErpAdapter, ErpToolCallResult } from "../../../src/adapter.ts";

export interface LocalAdapterRunnerArgs {
  readonly tenantId: string;
  readonly adapter: ErpAdapter;
}

export interface LocalToolCall {
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  readonly actorSubject: string | null;
}

export class LocalAdapterRunner {
  constructor(private readonly args: LocalAdapterRunnerArgs) {}

  callTool(call: LocalToolCall): Promise<ErpToolCallResult> {
    return this.args.adapter.callTool(
      call.toolName,
      call.arguments,
      {
        tenantId: this.args.tenantId,
        actorSubject: call.actorSubject,
      },
    );
  }
}
