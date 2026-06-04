import { assertEquals } from "@std/assert";
import { UnknownToolError } from "./adapter.ts";
import { DolibarrApiError } from "./adapters/dolibarr.ts";
import { FrappeApiError } from "./adapters/erpnext.ts";
import { erpToolErrorMapper } from "./error-mapper.ts";

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

Deno.test("erpToolErrorMapper — leaves unknown errors as JSON-RPC errors", () => {
  assertEquals(
    erpToolErrorMapper(new Error("boom"), "erpnext.customer_list"),
    null,
  );
});
