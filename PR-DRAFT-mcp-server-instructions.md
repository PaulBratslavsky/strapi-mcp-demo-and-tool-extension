# Proposal: expose MCP server instructions in `strapi.ai.mcp`

**Status:** draft proposal · not yet filed upstream
**Target repo:** `strapi/strapi` (the `@strapi/core` package, specifically `src/services/mcp/internal/McpServerFactory.ts`)
**Affects:** Strapi 5.47.0+ users building MCP server extensions

## Summary

Add support for the MCP **server instructions** primitive in Strapi's built-in MCP server. Today, Strapi creates the underlying `McpServer` with no `instructions` field, so plugins have no supported way to inject server-level guidance that LLM clients auto-load on connection. This proposal exposes a small surface — either a `setInstructions()` call on `strapi.ai.mcp` or an `mcp.instructions` config field — that maps directly to the MCP SDK's existing capability.

## Background — what server instructions are

The Model Context Protocol defines four primitives that servers can expose to LLM clients:

| Primitive | Discovery | Auto-loaded by LLM? |
|---|---|---|
| **Tools** | `tools/list` — model-controlled | Yes |
| **Prompts** | `prompts/list` — user-triggered (slash commands) | No |
| **Resources** | `resources/list` — application-controlled | Client-dependent (most do not auto-fetch) |
| **Server Instructions** | `initialize` response `instructions` field | **Yes — injected into LLM system prompt at connection** |

Server instructions are MCP's officially-recommended primitive for *"the LLM should always read X to understand how to use this server, independent of individual prompts or tools."* They are loaded once per session, automatically, by every spec-compliant client (Claude Desktop, Claude Code, Cursor, Windsurf, Gemini CLI). See the [official MCP blog post on server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/) and the [`InitializeResult` schema](https://modelcontextprotocol.io/specification/draft/schema#initializeresult).

## Problem

Today, Strapi's MCP server is created in `@strapi/core/dist/services/mcp/internal/McpServerFactory.js` like this (current behavior, observed in 5.47.0):

```js
const mcpServer = new mcp_js.McpServer(
  { name: 'strapi-mcp-server', version: '1.0.0' },
  { capabilities }
);
```

The MCP SDK's `McpServer` constructor accepts an `instructions: string` field in its second argument that is forwarded directly into the `initialize` response. Strapi hard-codes the options without it, so there is no path for plugins or config to inject server-level instructions.

### Why this matters

Plugin authors who want a tool to be reliably preceded by a workflow step (e.g. *"call `get_X_guide` before `create_X`"*) currently have only second-best options:

1. **Tool-description directives** ("REQUIRED: call X first"). Works, but the directive lives in one specific tool's description and only fires when that tool is being considered. There is no place to put server-wide guidance ("this Strapi instance uses i18n in en/fr only"; "all dates are stored UTC and tools accept ISO 8601 strings"; "the editorial workflow expects a draft → review → publish chain").
2. **MCP prompts.** Not LLM-triggered. Require explicit user invocation as slash commands; the LLM cannot auto-fetch a prompt based on intent.
3. **MCP resources.** Most clients (including Claude Code) do not auto-load resources. Unreliable for must-read content.
4. **Patch core via plugin monkey-patching.** Brittle; breaks on core upgrades.

The result: real-world plugin authors are recreating the *instructions* primitive in user-space via convention rather than using the spec primitive built exactly for this case.

## Proposed API

Two equally minimal surfaces, both small wrappers around the existing MCP SDK behavior. Either (or both) would resolve the gap.

### Option A — Imperative API on `strapi.ai.mcp`

```ts
strapi.ai.mcp.setInstructions(text: string): void
```

Called during a plugin's `register()` phase (mirroring `registerTool`, `registerPrompt`, `registerResource`). Concatenates with newlines if called more than once, so multiple plugins can contribute. Throws if called after `start()`, same lifecycle rule as the existing register methods.

```ts
// plugin register.ts
strapi.ai.mcp.setInstructions(`
When creating articles in this Strapi instance:
- Call \`get_article_authoring_guide\` before \`create_article_draft\` to load the required output format.
- Author and category lookups accept either a slug or a display name.
- The dataset uses en-US locale; do not pass other locale codes.
`.trim());
```

### Option B — Declarative config field

```ts
// config/server.ts
export default ({ env }) => ({
  // ...
  mcp: {
    enabled: true,
    instructions: 'When using this server, ...'   // ← new
  }
});
```

Simpler for the "one app, one instructions blob" case; less flexible than (A) for plugins that need to contribute their own segments.

**Recommendation: ship both.** The config field handles the common case (one app authoring its instructions); the imperative API handles the plugin case (multiple sources concatenating). The MCP SDK already supports a single `instructions` string at construction, so internally both surfaces resolve to the same merged value before `new McpServer(...)` runs.

## Implementation sketch

In `services/mcp/internal/McpServerFactory.ts` (and types in `services/mcp/index.ts`):

```ts
const mcpServer = new McpServer(
  { name: 'strapi-mcp-server', version: '1.0.0' },
  {
    capabilities,
    instructions: collectMergedInstructions(strapi),  // ← new
  }
);

function collectMergedInstructions(strapi: Core.Strapi): string | undefined {
  const fromConfig = strapi.config.get('server.mcp.instructions') as string | undefined;
  const fromPlugins = mcpInstructionsRegistry.getAll().join('\n\n');
  const merged = [fromConfig, fromPlugins].filter(Boolean).join('\n\n').trim();
  return merged || undefined;
}
```

The registry is a tiny module local to the MCP service that stores strings registered via `setInstructions`. Same lifecycle hooks as the existing capability registries (locked after `start()`).

Also extend the `McpService` interface in `@strapi/types/dist/modules/mcp.d.ts`:

```ts
export interface McpService {
  // ...existing methods...
  /**
   * Append server-level instructions to the MCP `initialize` response.
   * Auto-loaded by spec-compliant LLM clients into the system prompt.
   * Must be called during register() phase, before start().
   */
  setInstructions(text: string): void;
}
```

## Backwards compatibility

Fully backwards compatible. The `instructions` field is optional in both the MCP SDK and the spec. Existing Strapi installations with no plugin call to `setInstructions` and no `mcp.instructions` config will produce the same `initialize` response they do today (no `instructions` field).

## Alternatives considered

- **Do nothing; rely on tool descriptions.** Works for tool-specific chains but cannot express server-wide context (timezone, locale, editorial conventions) without bloating every tool's description.
- **Use MCP prompts as the substitute.** Requires user invocation, defeating the auto-load goal that server instructions exist to solve.
- **Use MCP resources.** Unreliable across clients; Claude Code does not auto-fetch resources today.
- **Expect plugins to monkey-patch `strapi.ai.mcp`.** Brittle; breaks on minor core releases.

## Validation plan

1. Unit test: register an instruction string, call the MCP `initialize` method, assert the response's `instructions` field matches.
2. Integration test: with `mcp.instructions` set in config, connect with `@modelcontextprotocol/sdk`'s client and read `client.getServerCapabilities()` / `client.getServerInfo()` to confirm injection.
3. End-to-end manual test with Claude Code: register an instruction `"When asked for stats, always call get_stats_overview"`, start a new Claude Code session, and observe the new session preferring that tool when the user asks an ambiguous question.

## Out of scope

- MCP `instructions` field is a single string at the protocol level. This proposal does not extend the MCP spec — only exposes existing SDK behavior.
- Per-client instruction targeting (different text for different clients) is not part of the MCP spec and not part of this proposal.

## Real-world usage (the plugin that motivated this proposal)

This proposal came out of building a Strapi plugin that registers MCP tools for a content workflow:

- `get_article_authoring_guide` — returns required output format (~4 KB markdown)
- `create_article_draft` — saves the article

The workflow only succeeds when the LLM calls `get_article_authoring_guide` *before* `create_article_draft`. Without server instructions, the only way to wire this is to put `"REQUIRED: call get_article_authoring_guide first"` as the first sentence of `create_article_draft`'s description. That works for one chain but doesn't generalize. A second workflow (say "publishing rules") would need the same trick repeated in every relevant tool. Server instructions would let the plugin state once:

> *"Article-creation tools chain as `get_article_authoring_guide` → `create_article_draft` → (optional) `publish_article`. Always start with the guide."*

…and every tool in that chain stays focused on its action.

## Citations

- [Server Instructions — MCP blog (2025-11-03)](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/)
- [`InitializeResult` schema](https://modelcontextprotocol.io/specification/draft/schema#initializeresult)
- [MCP Tools spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Resources spec](https://modelcontextprotocol.io/legacy/concepts/resources)
- [Strapi MCP server docs](https://docs.strapi.io/cms/features/strapi-mcp-server)
- [Best Practices for Building MCP Servers — Phil Schmid](https://www.philschmid.de/mcp-best-practices)
