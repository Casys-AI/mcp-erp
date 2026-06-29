import { assertStringIncludes } from "@std/assert";

function renderDetailViewer(mcpData: unknown): string {
  const html = Deno.readTextFileSync(
    new URL("./dist/detail-viewer/index.html", import.meta.url),
  );
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  if (!script) throw new Error("detail-viewer script not found");

  const app = { innerHTML: "" };
  const windowMock = {
    mcpData,
    parent: null as unknown,
    addEventListener: () => {},
  };
  windowMock.parent = windowMock;
  const documentMock = {
    getElementById(id: string) {
      if (id !== "app") return null;
      return app;
    },
  };

  new Function("window", "document", script)(windowMock, documentMock);

  return app.innerHTML;
}

Deno.test("detail-viewer — unwraps structuredContent.data before rendering", () => {
  const html = renderDetailViewer({
    structuredContent: {
      data: {
        name: "CO2301-001",
        status: "Shipment on process",
        items: [{ item_name: "Consulting", qty: "3" }],
      },
      order: {
        ref: "NATIVE-SHOULD-NOT-RENDER",
      },
    },
  });

  assertStringIncludes(html, "CO2301-001");
  assertStringIncludes(html, "Shipment on process");
  assertStringIncludes(html, "Consulting");
});

Deno.test("detail-viewer — falls back to root payload when data is absent", () => {
  const html = renderDetailViewer({
    structuredContent: {
      name: "LEGACY-001",
      status: "Validated",
    },
  });

  assertStringIncludes(html, "LEGACY-001");
  assertStringIncludes(html, "Validated");
});
