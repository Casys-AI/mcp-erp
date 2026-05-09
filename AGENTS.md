# Repository Guidelines

- **Stack**: Deno + TypeScript. No Node-specific runtime.
- **Purpose**: ERP-agnostic MCP adapter layer. OSS counterpart of the
  proprietary `erp-platform` SaaS.
- **Pattern reference**: `@casys/einvoice-core` + `@casys/mcp-einvoice` in
  the [`mcp-einvoice`](https://github.com/Casys-AI/mcp-einvoice) repo.

## Project Structure

```
mod.ts             # Public API (re-exports from src/)
src/
├── connection.ts  # ErpConnection (discriminated union, per-tenant creds)
├── adapter.ts     # ErpAdapter contract + tool definition shape
├── registry.ts    # buildAdapter(connection) → ErpAdapter
└── adapters/
    ├── erpnext.ts # ERPNext adapter (Frappe REST)
    └── dolibarr.ts # Dolibarr adapter (REST)
deno.json          # Package manifest (@casys/mcp-erp)
README.md
```

## Build & Development Commands

| Command           | Purpose                          |
| ----------------- | -------------------------------- |
| `deno task check` | `deno fmt --check && lint && check` |
| `deno task test`  | Run all tests                    |

## Coding Conventions

- **No globals, no env vars in adapters.** Connection is passed
  explicitly at factory time.
- **No silent error swallowing.** Errors must propagate or wrap into
  typed errors (`UnknownToolError`, future `ErpApiError`).
- **JSON Schema draft-07** for `inputSchema`. Keep schemas tight —
  `additionalProperties: false` is the default.
- **One file per adapter.** Adapter file owns its tool list + handlers.
- **Naming**: tools are `<erpType>.<action>` (e.g. `erpnext.customer_list`).

## Adding an ERP

1. Add a variant to the `ErpConnection` union in `src/connection.ts` and
   to `ERP_TYPES`.
2. Create `src/adapters/<erpType>.ts` exporting a `create<ErpType>Adapter`
   factory matching `ErpAdapterFactory<"erpType">`.
3. Register the factory in `src/registry.ts`.
4. Re-export from `mod.ts` if direct factory access is desired.
5. Add a smoke test under `src/adapters/<erpType>_test.ts`.

The discriminated-union typing makes step (3) compile-checked: forgetting
the registry entry is a TypeScript error.

## Versioning

- v0.0.x — pre-stable, breaking changes any time
- v0.x — pre-1.0, semver minor for breaking changes
- **No v1.0 until ≥3 production tenants depend on the package.**

## License

MIT.
