# Addendum — The `mcp.defineTool` / `defineResource` / `definePrompt` Builders

> **Status:** Forward-looking. The builders described here ship in
> [strapi/strapi#26603](https://github.com/strapi/strapi/pull/26603) and are available today only
> in an experimental build of `@strapi/strapi`. The main tutorial above targets stable **5.47.0**,
> which does **not** export them yet — so keep using the inline `registerTool({ ... })` form on
> stable. Switch to the builders once they land in a stable release.

The tutorial registers each tool as a plain object passed straight to
`strapi.ai.mcp.registerTool(...)`, and leans on a hand-written `StrapiMcpToolModule` type plus a
`RegisterTool` alias to keep things consistent. That works, but the types are something *you*
maintain — nothing infers your input schema into the handler, and nothing stops you from picking
the wrong access variant until the server boots.

PR #26603 adds a public `mcp` namespace to `@strapi/strapi` with three builders that close that
gap. They're the MCP equivalent of `factories` for content-manager APIs.

## What the builders are

```typescript
import { mcp } from '@strapi/strapi';

mcp.defineTool({ ... });     // → a tool definition, ready for registerTool()
mcp.defineResource({ ... }); // → a resource definition, ready for registerResource()
mcp.definePrompt({ ... });   // → a prompt definition, ready for registerPrompt()
```

At runtime each one returns its argument unchanged — they're identity functions. Their entire job
is at **compile time**: infer the `name`, the Zod input/output schema, and the handler types, and
narrow the access variant (`devModeOnly` vs `auth`) so the result is directly assignable to the
matching `register*()` call. The payoff: your handler's `args` are typed from
`resolveInputSchema` automatically, your return value is checked against `resolveOutputSchema`,
and a mismatch is a red squiggle in your editor instead of a crash on boot.

## Before / after

The tutorial's `list_recent_articles` tool, unchanged in behaviour, written with the builder:

**Before (inline — what the tutorial does):**

```typescript
import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "list_recent_articles",
      // …
    });
  },
};
export default tool;
```

**After (builder):**

```typescript
import { mcp } from "@strapi/strapi";
import { z } from "@strapi/utils";

export const listRecentArticles = mcp.defineTool({
  name: "list_recent_articles",
  title: "List recent articles",
  description: "Return the most recently published articles, newest first.",
  resolveInputSchema: () => z.object({ limit: z.number().int().min(1).max(25).optional() }),
  resolveOutputSchema: () =>
    z.object({
      count: z.number().int().nonnegative(),
      articles: z.array(
        z.object({
          documentId: z.string(),
          title: z.string(),
          slug: z.string().nullable(),
          publishedAt: z.string().nullable(),
        })
      ),
    }),
  auth: {
    policies: [
      { action: "plugin::content-manager.explorer.read", subject: "api::article.article" },
    ],
  },
  // `args` is inferred as { limit?: number } — no manual typing.
  createHandler: (strapi) => async ({ args }) => {
    const limit = args?.limit ?? 5;
    const entries = await strapi.documents("api::article.article").findMany({
      status: "published",
      sort: { publishedAt: "desc" },
      limit,
      fields: ["title", "slug", "publishedAt"],
    });
    const articles = entries.map((e: any) => ({
      documentId: e.documentId,
      title: e.title ?? "",
      slug: e.slug ?? null,
      publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : null,
    }));
    const payload = { count: articles.length, articles };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
```

The `StrapiMcpToolModule` type and the `register(registerTool)` wrapper are gone — the builder
*is* the type. You then register it wherever you keep your `register()` lifecycle:

```typescript
// register.ts
import { mcp } from "@strapi/strapi";
import { listRecentArticles } from "./tools/list-recent-articles";

const register = ({ strapi }) => {
  if (!strapi.ai.mcp.isEnabled()) return;
  strapi.ai.mcp.registerTool(listRecentArticles);
};
export default register;
```

## Resources and prompts get the same treatment

```typescript
const appInfo = mcp.defineResource({
  name: "app-info",
  uri: "strapi://app/info",
  metadata: { description: "Metadata about the app", mimeType: "application/json" },
  devModeOnly: true,
  createHandler: (strapi) => async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ ok: true }) }],
  }),
});

const appContext = mcp.definePrompt({
  name: "app-context",
  title: "App Context",
  description: "Provides context about the app",
  devModeOnly: true,
  createHandler: (strapi) => async () => ({
    messages: [{ role: "user", content: { type: "text", text: "You are connected to Strapi." } }],
  }),
});

// in register():
strapi.ai.mcp.registerResource(appInfo);
strapi.ai.mcp.registerPrompt(appContext);
```

## What does *not* change

- The registration calls are identical — `registerTool` / `registerResource` / `registerPrompt`.
- Auth is still Strapi's policy model (`auth.policies`), or `devModeOnly: true` for dev-only.
- The return shape is unchanged: human-readable `content` plus machine-readable
  `structuredContent`.
- **Names are still globally unique.** A builder-defined tool goes through the same registry as
  an inline one, so registering two tools (builder or not) under the same `name` throws at boot:
  `tool with name "…" is already registered`. Watch for this if a plugin already owns the name.

## Verified

These builders were tested against an experimental build that includes the PR (Strapi
`0.0.0-experimental.7873e85…`): the example tools compile, the access-variant narrowing works,
and all of them register cleanly on boot. Details in `PR-26603-test-report.md`.
