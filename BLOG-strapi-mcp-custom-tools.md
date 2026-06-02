# Extending Strapi 5.47's MCP Server With a Custom Plugin

**TL;DR**

- Strapi 5.47+ ships an MCP server **built in**. You enable it with one line in `config/server.ts`, point an MCP client (Claude Code, Cursor, Windsurf) at `/mcp`, and you immediately get CRUD tools for every content type — gated by the admin token's permissions.
- The out-of-the-box CRUD tools cover content types. **They do not cover custom controllers, custom workflows, or anything that isn't a plain entity.** That's where custom tools come in.
- You can call `strapi.ai.mcp.registerTool(...)` from anywhere in the `register()` phase, but wrapping that in a **plugin** makes the work shareable, versionable, and gives a clean folder structure once you have more than one tool.
- The best-practice pattern for chained, LLM-driven workflows (e.g. "write a draft following our format → save it") is **two cooperating tools**: a `get_*_guide` tool that returns instructions on demand, plus an action tool whose description begins with a "REQUIRED: call the guide tool first" directive. The LLM auto-discovers and auto-chains both.
- The reference implementation — including the plugin, the full folder layout, and a long-term proposal for upstream Strapi — lives in [this example project](#about-the-example-project).

## What is MCP, and why does it matter?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard for letting LLMs talk to external systems. Think of it as USB-C for AI: any MCP-compatible client (Claude Code, Claude Desktop, Cursor, Windsurf, Gemini CLI, …) can connect to any MCP-compatible server (Strapi, GitHub, Linear, Sentry, …) without bespoke glue code.

A server can expose three kinds of capability: **tools**, **resources**, and **prompts**. It can also send a block of **instructions** when a client connects. That last one is a field on the connection response, not a separate capability, but it acts like a fourth option.

The difference that matters: some of these the model picks up and uses on its own, and some only run when the human clicks them. That difference decides which one to use for a custom workflow.

| Primitive | Discovery | Auto-loaded by the LLM? |
|---|---|---|
| **Tools** | `tools/list` — model-controlled | ✅ Yes — the LLM decides when to call |
| **Prompts** | `prompts/list` — user-triggered slash commands | ❌ Only when the user explicitly invokes them |
| **Resources** | `resources/list` — application-controlled | ⚠️ Client-dependent (Claude Code does **not** auto-fetch) |
| **Server Instructions** | `initialize` response | ✅ Yes — injected into the system prompt at connection |

The "auto-loaded" column is the one to watch. It decides whether the model uses a capability on its own or waits for the user to trigger it.

```mermaid
flowchart LR
    subgraph "MCP Client (Claude Code / Cursor / …)"
        LLM[LLM]
    end
    subgraph "Strapi (5.47+)"
        MCP["/mcp endpoint<br/>(built-in)"]
        CT[("Auto-derived CRUD tools<br/>list / get / create / update / delete<br/>publish / unpublish / discard_draft")]
        CUSTOM[/"strapi.ai.mcp.registerTool(…)<br/>(your custom tools)"/]
    end
    LLM -->|"Bearer admin token"| MCP
    MCP --> CT
    MCP --> CUSTOM
```

## Step 1: Turn on the built-in MCP server

The MCP server is a [Beta feature that requires Strapi 5.47.0 or later](https://docs.strapi.io/cms/features/strapi-mcp-server). On that version it takes one line of config. Following the [code-based configuration docs](https://docs.strapi.io/cms/features/strapi-mcp-server#strapi-code-based-configuration), open `config/server.ts` and add `mcp.enabled: true`:

```ts
// config/server.ts
import type { Core } from '@strapi/strapi';

export default ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: { keys: env.array('APP_KEYS') },
  mcp: { enabled: true },          // ← that's the whole thing
});
```

Restart Strapi. The MCP endpoint is now live at `http://localhost:1337/mcp`.

> You can also turn the server on from the admin UI instead of editing config. See [Strapi admin panel configuration](https://docs.strapi.io/cms/features/strapi-mcp-server#strapi-admin-panel-configuration). To change the connection and request timeouts (`connectTimeoutMs`, `requestTimeoutMs`), see [Advanced options](https://docs.strapi.io/cms/features/strapi-mcp-server#advanced-options).

### Heads-up #1: the right token

The MCP server uses **Admin API Tokens**, not Content API Tokens. They look identical in the UI but live under different menus:

- ❌ **Settings → API Tokens**: these are for the Content API (`/api/...`). MCP rejects them with a 401.
- ✅ **Settings → Admin Tokens**: this is the one MCP accepts.

Create one with **Full Access** for local dev. You can give it narrower permissions later. The token value is shown only once, so copy it as soon as it appears.

### Heads-up #2: tool exposure mirrors token permissions

The MCP client only sees tools the token is allowed to use. A read-only token exposes the `list_*` and `get_*` tools and nothing else. A full-access token also exposes create, update, delete, and publish tools. There is no separate setting that grants MCP more than the token allows. The token sets the ceiling. The docs cover this under [Permission boundaries](https://docs.strapi.io/cms/features/strapi-mcp-server#permission-boundaries).

### Connect from Claude Code

Following the [Connecting Claude Code](https://docs.strapi.io/cms/features/strapi-mcp-server#connecting-claude-code) doc:

```bash
claude mcp add strapi-mcp --transport http http://localhost:1337/mcp \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Start a new Claude Code session and run `/mcp`. It should show `strapi-mcp ✓ Connected`. Now you can ask things like *"list the 3 most recent articles"* and the built-in tools answer. Cursor, Windsurf, and Claude Desktop each have their own setup steps in the [AI client configuration](https://docs.strapi.io/cms/features/strapi-mcp-server#ai-client-configuration) docs.

## Step 2: When the built-in tools aren't enough

For every content type, the built-in MCP server creates a set of tools automatically: `list`, `get`, `create`, `update`, `delete`, plus `publish`, `unpublish`, and `discard_draft` when Draft & Publish is on. The full list is in the [Content-type tools](https://docs.strapi.io/cms/features/strapi-mcp-server#content-type-tools) docs. This covers reading and writing entries.

It does not cover anything you wrote by hand: a custom controller, an aggregation, a computed view, a multi-step flow. If you have a `src/api/<thing>/controllers/<thing>.ts` with your own logic in it, the MCP server has no tool for it.

This project has a `stats` API with a custom controller that adds up counts:

```ts
// src/api/stats/services/stats.ts
export default {
  async overview() {
    const [articles, authors, categories] = await Promise.all([
      strapi.documents('api::article.article').count({ status: 'published' }),
      strapi.documents('api::author.author').count({}),
      strapi.documents('api::category.category').count({}),
    ]);
    return { articles, authors, categories };
  },
};
```

None of the built-in tools know this controller exists. To expose it, you register a custom tool.

## Step 3: Register a custom tool

The function to call is `strapi.ai.mcp.registerTool({...})`, documented in the [Plugin API](https://docs.strapi.io/cms/features/strapi-mcp-server#plugin-api) section. Two rules from those docs matter before you start:

- **Call it inside `register()`, not `bootstrap()`.** Strapi locks the tool list once the MCP server starts, and `register()` runs before that point. Register later and the tool will not show up.
- **Required fields are `name`, `title`, `description`, `resolveOutputSchema`, and either `auth` or `devModeOnly`.** `resolveInputSchema` is optional; leave it out for a tool that takes no arguments. The schema fields are functions, not plain objects. Strapi calls them on each request and passes the caller's permissions (`context.userAbility`), so a tool can return a narrower schema for a less-privileged token. The `z` you build the schema with has to come from `@strapi/utils`, not the `zod` package directly.

Here is the smallest working tool, registered straight in `src/index.ts`:

```ts
// src/index.ts — works, but doesn't scale
import { z } from '@strapi/utils';

export default {
  register({ strapi }) {
    strapi.ai.mcp.registerTool({
      name: 'get_stats_overview',
      title: 'Get content stats overview',
      description: 'Return aggregate counts of published articles, authors, and categories.',
      resolveOutputSchema: () => z.object({
        articles: z.number().int().nonnegative(),
        authors:  z.number().int().nonnegative(),
        categories: z.number().int().nonnegative(),
      }),
      auth: {
        policies: [
          { action: 'plugin::content-manager.explorer.read', subject: 'api::article.article' },
        ],
      },
      createHandler: (strapi) => async () => {
        const overview = await strapi.service('api::stats.stats').overview();
        return {
          content: [{ type: 'text', text: JSON.stringify(overview) }],
          structuredContent: overview,
        };
      },
    });
  },
  bootstrap() {},
};
```

Restart Strapi. The model now sees a `get_stats_overview` tool, calls it when it needs those counts, and gets back the typed object your schema describes.

So why bother with a plugin?

## Step 4: Why we wrapped this in a plugin

Registering tools directly in `src/index.ts` works. Plenty of small projects do exactly that. We chose a plugin instead, and the reasons add up once you have more than one or two tools:

- **It keeps the code in one place.** Everything MCP-related sits under `src/plugins/strapi-mcp/`. None of it mixes into the app's own `src/index.ts` or `src/lib/`. Someone opening the project later sees the folder name and knows what is inside.
- **It is portable.** A Strapi plugin is a folder with a `package.json`. You can `npm publish` it, or copy it into another Strapi project, and every tool comes with it, already wired up. The other project does not have to touch its own `src/index.ts`.
- **It has room to grow.** Five tools, a couple of guide files, some shared helpers: the plugin's `server/src/` folder holds all of it, and the app root stays clean.
- **It has the right lifecycle hooks.** A plugin gets its own `register`, `bootstrap`, and `destroy` functions. Tool registration belongs in `register()`, and the plugin gives you that function directly.

The cost: after every source change you run `npm run build` inside the plugin folder, then restart Strapi. The plugin loads from its `dist/` folder (the `exports` field in its `package.json` points there), so an un-built change has no effect. To avoid the manual rebuild during development, run `strapi-plugin watch:link`.

## Step 5: Scaffold the plugin

```bash
mkdir -p src/plugins/strapi-mcp
cd src/plugins/strapi-mcp
npx @strapi/sdk-plugin@latest init .
```

Answer the prompts (plugin name `strapi-mcp`, no admin panel UI needed for this case). Then wire it up in your main Strapi `config/plugins.ts`:

```ts
// config/plugins.ts
export default () => ({
  'strapi-mcp': {
    enabled: true,
    resolve: './src/plugins/strapi-mcp',
  },
});
```

## Step 6: The modular folder pattern

The default scaffold gives you `server/src/{register,bootstrap,destroy}.ts` and a `controllers/services/routes` tree we don't need. We added a small tree under `server/src/mcp/` with only what the plugin uses:

```
server/src/
├── register.ts                ← 1-liner: calls registerMcpTools(strapi)
└── mcp/
    ├── index.ts               ← loads every tool and registers it with strapi.ai.mcp
    ├── types.ts               ← the shared StrapiMcpToolModule type
    ├── guides/                ← long-form instruction content
    │   ├── article-authoring-guide.md   ← human-readable source of truth
    │   └── article-authoring-guide.ts   ← TS mirror exporting the markdown as a string
    └── tools/
        ├── index.ts                       ← export const tools = [...]
        ├── get-stats-overview.ts          ← simple read tool
        ├── list-recent-articles.ts        ← read tool with input args
        ├── get-article-authoring-guide.ts ← returns guide markdown on demand
        └── create-article-draft.ts        ← write tool; its description points at the guide
```

**To add a tool: drop a file in `tools/`, add one line to `tools/index.ts`, run `npm run build`, restart.** That is all it takes.

Two choices in this layout are worth explaining.

### Why the `.ts` mirror of the `.md`?

`@strapi/sdk-plugin` uses vite to bundle the plugin into a single `dist/server/index.js`. Vite does not copy `.md` files into that bundle, so a `.md` file the runtime tries to read at startup would not be there. Two ways around it:

1. Configure vite to copy the `.md` files in.
2. Put the markdown in a `.ts` file as a `String.raw` template literal.

We went with option 2. It works in both dev and production builds with no extra config. The `.md` file stays next to the `.ts` as the version a human edits, and the `.ts` is what the running plugin imports. The downside: edit the `.md` and you have to copy the change into the `.ts` by hand. A vite plugin that copies it automatically would remove that step.

### Why a `types.ts`?

Every tool file declares the same shape, so the file that loads them can loop over them without resorting to `any`:

```ts
// server/src/mcp/types.ts
import type { Core } from '@strapi/strapi';

export type RegisterTool = Core.Strapi['ai']['mcp']['registerTool'];

export type StrapiMcpToolModule = {
  register: (registerTool: RegisterTool, strapi: Core.Strapi) => void;
};
```

Each tool file then looks like:

```ts
// server/src/mcp/tools/get-stats-overview.ts
import { z } from '@strapi/utils';
import type { StrapiMcpToolModule } from '../types';

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({ /* …name, schemas, auth, createHandler… */ });
  },
};

export default tool;
```

The file that loads them imports the list and calls each one's `register`:

```ts
// server/src/mcp/index.ts
import type { Core } from '@strapi/strapi';
import { tools } from './tools';

export const registerMcpTools = (strapi: Core.Strapi) => {
  if (!strapi.ai?.mcp?.isEnabled()) {
    strapi.log.warn('[strapi-mcp plugin] MCP not enabled — skipping.');
    return;
  }
  const registerTool = strapi.ai.mcp.registerTool.bind(strapi.ai.mcp);
  for (const tool of tools) tool.register(registerTool, strapi);
  strapi.log.info(`[strapi-mcp plugin] Registered ${tools.length} custom MCP tool(s).`);
};
```

And the plugin's `register.ts` is just:

```ts
// server/src/register.ts
import { registerMcpTools } from './mcp';
export default ({ strapi }) => { registerMcpTools(strapi); };
```

That is the whole wiring. After this, every new tool is one new file plus one line in the list.

## Step 7: Chained tools for LLM workflows

`get_stats_overview` is a single call: the model asks for it, gets the data, and is done. Read tools work that way. A workflow is harder, because it is more than one step.

The goal: the user says *"write a blog post about Next.js server actions and save it as a draft,"* and the model writes it in our format (a TL;DR section, a citations block, and so on) without us repeating those rules every time.

The first attempt was an MCP **prompt** called `write_technical_blog_post` that returned the format rules. It did not work, and the reason is the "auto-loaded" column from the table at the top. A prompt only runs when the user picks it. In Claude Code and other clients, prompts show up as slash commands the user clicks. The model will not fetch a prompt on its own just because the task seems to call for it. So the format rules sat in a prompt the model never opened.

The fix was **two tools that work together**:

```ts
// server/src/mcp/tools/get-article-authoring-guide.ts
const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: 'get_article_authoring_guide',
      title: 'Get the article authoring guide',
      description:
        "Return the required output format and section rules for writing articles in this Strapi instance. " +
        "Call this BEFORE drafting article content, then follow the returned format exactly when constructing " +
        "`create_article_draft`'s `content_markdown`.",
      resolveOutputSchema: () => z.object({ guide_markdown: z.string() }),
      auth: { policies: [{ action: 'plugin::content-manager.explorer.read', subject: 'api::article.article' }] },
      createHandler: () => async () => ({
        content: [{ type: 'text', text: ARTICLE_AUTHORING_GUIDE_MD }],
        structuredContent: { guide_markdown: ARTICLE_AUTHORING_GUIDE_MD },
      }),
    });
  },
};
```

The second tool saves the draft. Its description **starts** by telling the model to call the guide tool first:

```ts
// server/src/mcp/tools/create-article-draft.ts (excerpt)
description:
  "REQUIRED: call `get_article_authoring_guide` FIRST to learn the required output format " +
  "before writing `content_markdown`. Then save a new article as a draft (not published). " +
  "The markdown content is wrapped in a single shared.rich-text block. " +
  "Optionally link an author or category by their slug or display name.",
```

Now when the user says *"write a post about X and save it as a draft,"* the model does this on its own:

1. Lists the tools and sees `create_article_draft`.
2. Reads its description and sees the `REQUIRED` line.
3. Calls `get_article_authoring_guide` first.
4. Gets the format rules back and writes the draft to match them.
5. Calls `create_article_draft` to save it.

The user does not have to click anything or paste the format rules. The model finds the order by reading the tool descriptions, because both tools are the kind it loads and calls on its own.

```mermaid
sequenceDiagram
    participant U as User
    participant L as LLM (Claude Code)
    participant S as Strapi MCP
    U->>L: "Write a post about RSC and save it"
    L->>S: tools/list
    S-->>L: 4 tools (incl. create_article_draft)
    Note over L: Reads create_article_draft description<br/>sees "REQUIRED: call get_article_authoring_guide first"
    L->>S: tools/call get_article_authoring_guide
    S-->>L: guide markdown (TL;DR, sections, citations format)
    Note over L: Drafts post following the guide
    L->>S: tools/call create_article_draft({title, description, content_markdown, …})
    S-->>L: { documentId, status: 'draft', … }
    L-->>U: "Saved as draft. ID: …"
```

### Why not MCP server instructions?

There is a better fit for this in the protocol: [MCP server instructions](https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/). The server sends a block of text when a client connects, and the client adds it to the model's system prompt. This is the part built for "the model should always read X before using this server." It loads on connect, without the user doing anything.

Strapi 5.47 does not let a plugin set it. The MCP SDK underneath supports an `instructions` field, but Strapi builds the server (in `McpServerFactory.ts`, with `new McpServer(...)`) without passing one, and there is no plugin method to supply it. We wrote [a draft proposal in the repo](#about-the-example-project) (`PR-DRAFT-mcp-server-instructions.md`) to add a `setInstructions()` method to `strapi.ai.mcp`.

Until that exists, the two-tool approach (a guide tool plus a save tool whose description points at it) is the way to make a model follow a multi-step workflow. It is also what larger MCP servers such as Linear, Sentry, and GitHub do today.

One more reason to stay with tools: **`registerTool` is the only thing the [Plugin API](https://docs.strapi.io/cms/features/strapi-mcp-server#plugin-api) documents.** The code has types for registering prompts and resources, but those are not part of the documented, supported API. Building the workflow out of tools keeps the whole thing on the supported path.

## Gotchas

These cost us time and are not in the docs:

- **The plugin loads from `dist/`, not `server/src/`.** After every source change, run `npm run build` in the plugin folder and restart Strapi. If you edit the source and skip the build, nothing changes and it looks like your edit did nothing.
- **MCP needs an Admin Token, not a Content API Token.** They are created on different settings pages and look the same. Only the Admin Token works.
- **Build schemas with `z` from `@strapi/utils`, not from the `zod` package.** Strapi pulls in zod 3 as a dependency. If your project also has zod 4, importing `zod` directly can load the wrong version and crash. The `z` from `@strapi/utils` is the one Strapi is using, so use that.
- **CASL policy strings matter.** Use the exact action constants Strapi's content-manager uses:
  - `plugin::content-manager.explorer.read`
  - `plugin::content-manager.explorer.create`
  - `plugin::content-manager.explorer.update`
  - `plugin::content-manager.explorer.delete`
  - `plugin::content-manager.explorer.publish`
- **Dynamic zones are awkward.** Strapi's MCP server documents this under [Known limitations](https://docs.strapi.io/cms/features/strapi-mcp-server#known-limitations) (dynamic zones are passed as untyped arrays; you also can't upload new media via MCP). We sidestepped it by always wrapping the LLM's markdown in a single `shared.rich-text` block on save. Human editors can rearrange in the admin UI after.
- **Strapi does not fill in `uid` fields on a draft create.** A `slug` field stays empty. Pass the slug yourself, or build it from the title in your handler.

## When to skip the plugin

A plugin is not always the right call. If you have **one or two tools**, no plans to share them, and you do not mind a few extra lines in `src/index.ts`, call `strapi.ai.mcp.registerTool` directly in your app's `register()` hook. The plugin is worth it when:

- You have three or more tools, or expect to.
- You want to publish the integration or reuse it in another project.
- The tools belong together as one feature.

Pulling a plugin out before you need it costs the same as any other early abstraction: more structure to maintain than the problem currently calls for.

## About the example project

Every line of code in this post comes from a working example you can clone and run. The repo includes:

- The full plugin scaffold at `src/plugins/strapi-mcp/`
- Working tools: `get_stats_overview`, `list_recent_articles`, `get_article_authoring_guide`, `create_article_draft`
- Better Auth replacing `users-permissions` (separate write-up)
- `PR-DRAFT-mcp-server-instructions.md`, the proposal for adding server-instructions support to Strapi's MCP

Start it up, create an admin token, and point Claude Code, Cursor, or Windsurf at `http://localhost:1337/mcp`. From there you can reproduce everything in this post.

## Further reading in the Strapi docs

The official [Strapi MCP server documentation](https://docs.strapi.io/cms/features/strapi-mcp-server) is the canonical reference. The sections most relevant to this post:

- [Configuration → Strapi code-based configuration](https://docs.strapi.io/cms/features/strapi-mcp-server#strapi-code-based-configuration) — the `config/server.ts` toggle
- [Advanced options](https://docs.strapi.io/cms/features/strapi-mcp-server#advanced-options) — transport timeouts
- [AI client configuration](https://docs.strapi.io/cms/features/strapi-mcp-server#ai-client-configuration) — connecting Claude Code, Cursor, Windsurf, Claude Desktop
- [Available tools](https://docs.strapi.io/cms/features/strapi-mcp-server#available-tools) / [Content-type tools](https://docs.strapi.io/cms/features/strapi-mcp-server#content-type-tools) — the auto-derived CRUD surface
- [Permission boundaries](https://docs.strapi.io/cms/features/strapi-mcp-server#permission-boundaries) — how the admin token caps tool exposure
- [Stateless architecture](https://docs.strapi.io/cms/features/strapi-mcp-server#stateless-architecture) — why every request is independently authenticated
- [Known limitations](https://docs.strapi.io/cms/features/strapi-mcp-server#known-limitations) — dynamic zones, media uploads, etc.
- [Plugin API](https://docs.strapi.io/cms/features/strapi-mcp-server#plugin-api) — `strapi.ai.mcp.registerTool`, the basis for everything custom in this post

**Citations**

- Strapi MCP server documentation: https://docs.strapi.io/cms/features/strapi-mcp-server
- Model Context Protocol homepage: https://modelcontextprotocol.io
- MCP Tools specification: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP Resources concept: https://modelcontextprotocol.io/legacy/concepts/resources
- MCP Server Instructions (blog post): https://blog.modelcontextprotocol.io/posts/2025-11-03-using-server-instructions/
- MCP Prompts and Resources — DEV community: https://dev.to/aws-heroes/mcp-prompts-and-resources-the-primitives-youre-not-using-3oo1
- Best Practices for Building MCP Servers — Phil Schmid: https://www.philschmid.de/mcp-best-practices
- MCP Cheat Sheet 2026: https://www.webfuse.com/mcp-cheat-sheet
- Strapi SDK Plugin: https://github.com/strapi/sdk-plugin
