# Test Report — PR strapi/strapi#26603 (`mcp.defineTool` / `defineResource` / `definePrompt`)

**Date:** 2026-06-16
**PR:** [feat(mcp): export defineTool/defineResource/definePrompt builders](https://github.com/strapi/strapi/pull/26603)
**Tested by:** Paul Bratslavsky
**Companion to:** `how-to-build-custom-mcp-tools-in-strapi.md`

---

## Summary

The PR adds a public `mcp` namespace to `@strapi/strapi` exposing three identity/builder
helpers — `mcp.defineTool`, `mcp.defineResource`, `mcp.definePrompt`. I built five
capabilities against these builders in a real Strapi app, type-checked them, and booted the
server to confirm they register through the live MCP registries. **Result: pass.** The builders
behave as documented; the only failure encountered was a tool-name collision in my own test
setup (expected behaviour, not a PR defect), which I resolved by renaming.

---

## Why this matters

**Why the PR is necessary.** Today, a plugin author defining an MCP capability has no
ergonomic entry point. They must hand-write the definition object and type it manually against
`Modules.MCP.*` from `@strapi/types` — there is no inference and no narrowing, so a typo in
`name`, a mismatched Zod schema, or picking the wrong access variant (`devModeOnly` vs `auth`)
is only caught at runtime, if at all. The tutorial this report accompanies works around the gap
by hand-rolling a `StrapiMcpToolModule` type and a `RegisterTool` alias just to keep tool
modules consistent — boilerplate that exists purely because the framework offered no builder.

**What it adds.** Three identity helpers that return their input unchanged at runtime but, at
compile time, infer the tool's `name`, input/output schema, and handler types, and narrow the
access variant so the result is directly assignable to `strapi.ai.mcp.registerTool/Resource/
Prompt()`. They mirror the role `factories` plays for content-manager APIs, but live in a
dedicated `mcp` namespace so MCP concerns stay separate from content-manager ones.

**Why it matters in practice.**
- **Inference instead of hand-typing.** The handler's `args` are typed from `resolveInputSchema`
  automatically; the output is checked against `resolveOutputSchema`. No manual `Modules.MCP.*`
  annotations.
- **Errors move left.** Wrong access variant, schema/handler mismatch, or a bad return shape
  becomes a TypeScript error at author time rather than a boot-time throw.
- **Less boilerplate.** The custom `StrapiMcpToolModule` / `RegisterTool` plumbing in the
  tutorial collapses to `const tool = mcp.defineTool({ ... })`.
- **Clean "define here, register there" split.** Definitions can live in their own modules and
  be imported into `register()`, which is exactly how the test app is structured.

---

## Environment

| Item | Value |
|---|---|
| Test app | `/Users/paul/work/temp/test-mcp-post/my-app` (`create-strapi-app --example`) |
| `@strapi/strapi` | `0.0.0-experimental.7873e8594578…` (experimental build incl. the PR) |
| Node | v22.18.0 |
| Yarn | 4.12.0 (`nodeLinker: node-modules`) |
| MCP | `mcp: { enabled: true }` in `config/server.ts` |

> Note: the tutorial repo (`strapi-with-content`) is on stable **5.47.0**, which does **not**
> export `mcp`. The builders are only available in a build that includes #26603, so all runtime
> testing was done in the experimental `my-app`.

---

## What I tested

Five capabilities, all defined via the new builders in `src/mcp-example.ts` and registered in
`src/index.ts`:

| Capability | Builder | Access | Notes |
|---|---|---|---|
| `get_stats_overview` | `mcp.defineTool` | `auth` (custom permission) | Ported from the tutorial; backed by `api::stats.stats`. |
| `list_recent_articles_builder` | `mcp.defineTool` | `auth` (content-manager read) | Has an input schema; ported from the tutorial's `list_recent_articles`. |
| `create_article_draft` | `mcp.defineTool` | `auth` (content-manager create) | Mutation; stricter input schema. |
| `app-info` | `mcp.defineResource` | `devModeOnly` | JSON resource at `strapi://app/info`. |
| `app-context` | `mcp.definePrompt` | `devModeOnly` | Context-seeding prompt. |

---

## Results

| Check | Outcome |
|---|---|
| `mcp` namespace exported by the experimental build | ✅ `defineTool`, `defineResource`, `definePrompt` all present as functions |
| TypeScript compiles (`yarn strapi build`) | ✅ Pass — incl. `auth`-variant narrowing through `defineTool` |
| Server boots and runs `register()` without throwing | ✅ `✔ Loading Strapi`, `[MCP] Server available at /mcp`, `Welcome back!` |
| All five builder-defined capabilities accepted by the registries | ✅ No registration error after the collision was resolved |
| Enumerate capabilities over the wire (`tools/list` / `prompts/list` / `resources/list`) | ✅ With an admin MCP token, all three builder tools (`get_stats_overview`, `list_recent_articles_builder`, `create_article_draft`), the `app-context` prompt, and the `app-info` resource are discoverable |
| Invoke builder tools over the wire (`tools/call`) | ✅ `get_stats_overview` → `{articles:6,authors:2,categories:5}`; `list_recent_articles_builder` → live articles; `create_article_draft` → created a draft then deleted it via `delete_article` (clean). Auth policies enforced and satisfied by the granted token |
| End-to-end via Claude Desktop target (port 1338) | ✅ All five capabilities present on the exact instance Claude Desktop connects to (`mcp-remote → http://localhost:1338/mcp`), picked up automatically by `yarn develop` watch mode |

### Finding: tool names are globally unique (expected)

First boot **failed** with:

```
Error: [MCP] tool with name "list_recent_articles" is already registered. Names must be unique.
```

Cause: the `strapi-extended-mcp` plugin already registers `list_recent_articles` (and
`get_article_authoring_guide`). My builder-defined tool reused that name. This is **correct
framework behaviour, not a PR bug** — it confirms builder-defined tools flow through the same
`McpCapabilityDefinitionRegistry` and obey the same uniqueness rule as inline definitions.
Resolved by renaming the builder tool to `list_recent_articles_builder`; the server then booted
cleanly.

---

## Verdict

**Pass / safe to merge from a consumer's perspective.** The builders are pure identity helpers
at runtime (no behavioural change to registration), they type-check including access-variant
narrowing, and capabilities defined through them register exactly like inline objects. They are
a strict ergonomic improvement over the hand-typed pattern the current tutorial documents.

### Follow-ups
1. ~~**Over-the-wire check.**~~ ✅ Done — with an admin MCP token, all five capabilities are
   discoverable via `tools/list` / `prompts/list` / `resources/list`, and all three tools were
   invoked successfully via `tools/call` (auth enforced): `get_stats_overview`,
   `list_recent_articles_builder`, and `create_article_draft` (the created draft was deleted
   afterward). Verified against the live Claude Desktop target on port 1338.
2. **Docs/blog.** Once the builders land in a stable release, update the tutorial to the builder
   form. Draft addendum: `how-to-build-custom-mcp-tools-in-strapi.addendum.md`.
3. **Version availability.** Builders are experimental-only today; confirm the target stable
   version before recommending them publicly.



