import { assertEquals } from "@std/assert";
import { UnknownToolError } from "./adapter.ts";
import { DolibarrApiError } from "./adapters/dolibarr.ts";
import { FrappeApiError } from "./adapters/erpnext.ts";
import { ErpProviderError } from "./connection-provider.ts";
import { erpToolErrorMapper } from "./error-mapper.ts";
import { NormalizedError } from "./normalized.ts";
import { WriteError } from "./write.ts";

Deno.test("erpToolErrorMapper — maps adapter errors to tool errors", () => {
  assertEquals(
    erpToolErrorMapper(
      new UnknownToolError("erpnext", "erpnext.nope"),
      "erpnext.nope",
    ),
    "Unknown erpnext tool: erpnext.nope",
  );
  assertEquals(
    erpToolErrorMapper(
      new FrappeApiError("ERPNext GET /api/resource/Customer failed", 403, {}),
      "erpnext.customer_list",
    ),
    "ERPNext GET /api/resource/Customer failed",
  );
  assertEquals(
    erpToolErrorMapper(
      new DolibarrApiError("Dolibarr GET /thirdparties failed", 403, {}),
      "dolibarr.thirdparty_list",
    ),
    "Dolibarr GET /thirdparties failed",
  );
});

Deno.test("erpToolErrorMapper — maps validation TypeError with tool name", () => {
  assertEquals(
    erpToolErrorMapper(
      new TypeError("limit must be <= 100"),
      "erpnext.customer_list",
    ),
    "erpnext.customer_list: limit must be <= 100",
  );
});

Deno.test("erpToolErrorMapper — maps provider errors without leaking credentials", () => {
  const mapped = erpToolErrorMapper(
    new ErpProviderError(
      "TENANT_NOT_FOUND",
      {
        tenantId: "tenant-1",
        apiKey: "key-123",
        apiSecret: "secret-456",
        nested: {
          accessToken: "token-789",
          company: "Casys",
        },
      },
      "verify tenant registration before retrying",
    ),
    "erpnext.customer_list",
  );

  if (mapped === null) {
    throw new Error("expected ErpProviderError to map to a tool error result");
  }

  assertEquals(mapped.includes("key-123"), false);
  assertEquals(mapped.includes("secret-456"), false);
  assertEquals(mapped.includes("token-789"), false);
  assertEquals(JSON.parse(mapped), {
    code: "TENANT_NOT_FOUND",
    context: {
      tenantId: "tenant-1",
      apiKey: "[REDACTED]",
      apiSecret: "[REDACTED]",
      nested: {
        accessToken: "[REDACTED]",
        company: "Casys",
      },
    },
    recovery: "verify tenant registration before retrying",
  });
});

Deno.test("erpToolErrorMapper — redacts Frappe token credentials in authHeader and recovery", () => {
  const mapped = erpToolErrorMapper(
    new ErpProviderError(
      "TENANT_AUTH_FAILED",
      {
        authHeader: "token key123:secret456",
        headers: { dolapikey: "dolikey" },
        authorization: "Bearer abc.def",
      },
      "retry with token key123:secret456",
    ),
    "erpnext.customer_list",
  );

  if (mapped === null) {
    throw new Error("expected ErpProviderError to map to a tool error result");
  }

  // No credential fragment may survive anywhere in the serialized error.
  assertEquals(mapped.includes("key123"), false);
  assertEquals(mapped.includes("secret456"), false);
  assertEquals(mapped.includes("dolikey"), false);

  const parsed = JSON.parse(mapped) as {
    context: { authHeader: string; headers: { dolapikey: string } };
    recovery: string;
  };
  assertEquals(parsed.context.authHeader, "[REDACTED]");
  assertEquals(parsed.context.headers.dolapikey, "[REDACTED]");
  assertEquals(parsed.recovery, "retry with token [REDACTED]");
});

Deno.test("erpToolErrorMapper — leaves unknown errors as JSON-RPC errors", () => {
  assertEquals(
    erpToolErrorMapper(new Error("boom"), "erpnext.customer_list"),
    null,
  );
});

Deno.test("erpToolErrorMapper — serializes WriteError to structured JSON", () => {
  const out = erpToolErrorMapper(
    new WriteError("INVALID_MODE", { mode: "dry" }, "Pass preview or commit."),
    "erp.customer_create",
  );
  assertEquals(typeof out, "string");
  const parsed = JSON.parse(out as string);
  assertEquals(parsed.code, "INVALID_MODE");
  assertEquals(parsed.context.mode, "dry");
  assertEquals(parsed.recovery, "Pass preview or commit.");
});

Deno.test("erpToolErrorMapper — serializes NormalizedError to structured JSON", () => {
  const out = erpToolErrorMapper(
    new NormalizedError(
      "UNKNOWN_ERP_TYPE",
      "bad",
      { erpType: "sap" },
      "Use erpnext or dolibarr.",
    ),
    "erp.customer_create",
  );
  const parsed = JSON.parse(out as string);
  assertEquals(parsed.code, "UNKNOWN_ERP_TYPE");
  assertEquals(parsed.context.erpType, "sap");
});
