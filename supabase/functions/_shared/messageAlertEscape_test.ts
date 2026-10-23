import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml } from "./html.ts";

const src = await Deno.readTextFile(new URL("../send-message-email-alert/index.ts", import.meta.url));
const graph = await Deno.readTextFile(new URL("../sync-graph-email-history/index.ts", import.meta.url));

Deno.test("message alert escapes sender name payload", () => {
  assertEquals(escapeHtml('<img src=x onerror=alert(1)>"'), "&lt;img src=x onerror=alert(1)&gt;&quot;");
});
Deno.test("message alert template never interpolates raw sender/title", () => {
  assert(!src.includes("Nova mensagem de ${senderName}</h2>"));
  assert(!src.includes(">${convTitle}</p>"));
  assert(src.includes("${safeSender}") && src.includes("${safeTitle}"));
});
Deno.test("graph sync completion log excludes result payload", () => {
  assert(!graph.includes("Completed: ${JSON.stringify(result)}"));
});
