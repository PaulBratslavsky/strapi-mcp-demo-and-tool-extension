#!/usr/bin/env node
/**
 * End-to-end smoke test for the strapi-extended-mcp plugin's custom tools.
 *
 * Usage:
 *   MCP_TOKEN=<admin-api-token> node scripts/test-mcp.mjs
 *   node scripts/test-mcp.mjs <admin-api-token>
 *
 * Requires Strapi running with the MCP server enabled (config/server.ts -> mcp.enabled).
 * Exits non-zero if any check fails.
 */

const URL = process.env.MCP_URL ?? "http://localhost:1337/mcp";
const TOKEN = process.env.MCP_TOKEN ?? process.argv[2];

if (!TOKEN) {
  console.error(
    "Missing admin token. Pass MCP_TOKEN=... or node scripts/test-mcp.mjs <token>"
  );
  process.exit(2);
}

let nextId = 1;

// The MCP endpoint replies with an SSE frame: `event: message\ndata: {json}`.
// Parse the first `data:` line out of the body.
async function rpc(method, params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${method}: ${await res.text()}`);
  }
  const text = await res.text();
  const line = text
    .split("\n")
    .find((l) => l.startsWith("data:"));
  if (!line) throw new Error(`No data frame for ${method}: ${text.slice(0, 200)}`);
  const payload = JSON.parse(line.replace(/^data:\s*/, ""));
  if (payload.error) {
    throw new Error(`RPC error for ${method}: ${JSON.stringify(payload.error)}`);
  }
  return payload.result;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function callTool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert(!result.isError, `tool ${name} returned isError`);
  return result.structuredContent ?? result;
}

const CUSTOM_TOOLS = [
  "get_stats_overview",
  "list_recent_articles",
  "get_content_api_docs",
  "get_article_authoring_guide",
  "get_extended_mcp_info",
];
const REMOVED_TOOLS = ["create_article_draft"];

console.log(`\nTesting MCP server at ${URL}\n`);

await check("initialize handshake", async () => {
  const r = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-mcp", version: "1.0" },
  });
  assert(r.serverInfo?.name, "no serverInfo.name in initialize result");
});

let toolNames = [];
await check("tools/list responds", async () => {
  const r = await rpc("tools/list");
  toolNames = r.tools.map((t) => t.name);
  assert(toolNames.length > 0, "no tools returned at all");
});

// Each custom tool gates on its own plugin permission
// (plugin::strapi-extended-mcp.<x>), granted per-tool in
// Settings -> Admin Tokens -> Plugins. We don't hardcode which ones are granted
// (that's up to whoever set up the token). Instead we assert the RBAC contract
// for every custom tool: a granted tool is visible AND callable; an ungranted
// tool is invisible AND its call is rejected. That holds for any grant set.
const granted = CUSTOM_TOOLS.filter((t) => toolNames.includes(t));
const gated = CUSTOM_TOOLS.filter((t) => !toolNames.includes(t));
console.log(
  `  granted (visible): ${granted.join(", ") || "(none)"}\n  gated (hidden):    ${gated.join(", ") || "(none)"}`
);

await check("granted custom tools are callable", async () => {
  for (const name of granted) {
    const result = await rpc("tools/call", { name, arguments: {} });
    assert(!result.isError, `granted tool ${name} returned an error when called`);
  }
});

await check("gated custom tools reject calls", async () => {
  for (const name of gated) {
    const result = await rpc("tools/call", { name, arguments: {} });
    assert(
      result.isError,
      `gated tool ${name} was callable despite not being granted`
    );
  }
});

await check("create_article_draft is no longer registered", async () => {
  for (const t of REMOVED_TOOLS) {
    assert(!toolNames.includes(t), `removed tool still present: ${t}`);
  }
});

await check("built-in content-type tools are visible (token itself works)", async () => {
  // The token does have content-manager permissions, so Strapi's auto-derived
  // tools should appear. Confirms the gating above is about our permissions,
  // not a broken token.
  assert(
    toolNames.some((n) => n === "list_article" || n === "get_global"),
    "no built-in content-type tools visible; token may be misconfigured"
  );
});

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`
);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
  process.exit(1);
}
console.log("All MCP checks passed.\n");
