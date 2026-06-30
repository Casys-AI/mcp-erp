# Repository Guidelines

- **Stack**: Deno + TypeScript. No Node-specific runtime.
- **Purpose**: ERP-agnostic MCP adapter layer. OSS counterpart of the
  proprietary `erp-platform` SaaS.
- **Pattern reference**: `@casys/einvoice-core` + `@casys/mcp-einvoice` in the
  [`mcp-einvoice`](https://github.com/Casys-AI/mcp-einvoice) repo.

## Project Structure

```
mod.ts             # Public API (re-exports from src/)
src/
├── domain/        # Transverse core: connection, adapter, write, lifecycle
├── features/      # Vertical slices by business entity
├── platform/      # Raw ERP I/O, MCP projection, viewers
├── registry.ts    # buildAdapter(connection) → ErpAdapter
└── normalized-adapter.ts # Cross-ERP normalized tool facade
deno.json          # Package manifest (@casys/mcp-erp)
README.md
```

## Build & Development Commands

| Command           | Purpose                             |
| ----------------- | ----------------------------------- |
| `deno task check` | `deno fmt --check && lint && check` |
| `deno task test`  | Run all tests                       |

## Coding Conventions

- **No globals, no env vars in adapters.** Connection is passed explicitly at
  factory time.
- **No silent error swallowing.** Errors must propagate or wrap into typed
  errors (`UnknownToolError`, future `ErpApiError`).
- **JSON Schema draft-07** for `inputSchema`. Keep schemas tight —
  `additionalProperties: false` is the default.
- **Provider adapters stay under `src/platform/erp/<erpType>/`.** Keep raw HTTP
  I/O in `client.ts`, provider payload shapes in `types.ts`, and split large
  adapters by native tool family under `handlers/` when they become too large.
- **Naming**: tools are `<erpType>.<action>` (e.g. `erpnext.customer_list`).

## Adding an ERP

1. Add a variant to the `ErpConnection` union in `src/domain/connection.ts` and
   to `ERP_TYPES`.
2. Create `src/platform/erp/<erpType>/client.ts` for raw ERP I/O,
   `src/platform/erp/<erpType>/tools.ts` for provider tool manifests, and
   `src/platform/erp/<erpType>/adapter.ts` exporting a `create<ErpType>Adapter`
   factory matching `ErpAdapterFactory<"erpType">`. Put extracted native tool
   families under `src/platform/erp/<erpType>/handlers/`.
3. Register the factory in `src/registry.ts`.
4. Add or extend feature mappers/contracts under `src/features/<entity>/` only
   when normalized mapping is proven for the ERP.
5. Re-export from `mod.ts` if direct factory access is desired.
6. Add a smoke test colocated with the platform adapter, e.g.
   `src/platform/erp/<erpType>/adapter_test.ts`.

The discriminated-union typing makes step (3) compile-checked: forgetting the
registry entry is a TypeScript error.

## Versioning

- v0.0.x — pre-stable, breaking changes any time
- v0.x — pre-1.0, semver minor for breaking changes
- **No v1.0 until ≥3 production tenants depend on the package.**

## License

MIT.
