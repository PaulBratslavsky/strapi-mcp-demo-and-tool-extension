---
name: setup-strapi-mcp
description: >
  Set up Strapi's built-in MCP server and scaffold an example custom tool, in a
  Strapi v5 project. Enables the MCP server, then (asking first) registers an
  example tool either inline in the app's src/index.ts, via a generated plugin,
  or both — each gated on its own admin permission to show RBAC. Use whenever
  someone says "set up strapi mcp", "scaffold strapi mcp", "add an MCP tool to
  strapi", "bootstrap the strapi mcp server", "register a custom mcp tool in
  strapi", or is otherwise trying to expose custom tools from a Strapi backend
  over MCP. Strapi 5.47.0+ only.
---

# Set up Strapi MCP with an example tool

Strapi 5.47+ ships an MCP server built in. This skill turns it on and gives the
user a working example of a custom tool, so they have a real starting point
instead of a blank page. There are two ways to register a custom tool, and they
teach different things, so the skill asks which the user wants:

- **Inline** — registered in the app's own `src/index.ts`. Fastest; fine for one
  or two tools.
- **Plugin** — a small generated plugin (`strapi-extended-mcp`). More files, but
  shareable and the natural home once you have several tools.

Both example tools are content-agnostic (they read `strapi.config` and
`strapi.contentTypes`), so the skill works on any Strapi v5 project, not just one
with specific content types.

## Step 0: Pre-flight

1. Find the Strapi project root: a `package.json` with `@strapi/strapi` in
   `dependencies`. If you're in a monorepo, descend into that folder.
2. Read the `@strapi/strapi` version. **It must be `5.47.0` or higher** — the
   built-in MCP server does not exist before that. If it's lower, stop and tell
   the user to upgrade; don't scaffold against an unsupported version.
3. Detect the package manager from the lockfile: `yarn.lock` → yarn,
   `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm. Use it consistently.

## Step 1: Ask which registration path

Use AskUserQuestion (or just ask) before writing anything:

> Register the example tool **inline** (`src/index.ts`), as a **plugin**, or
> **both**?

Default to **both** — seeing the same idea done two ways is the point. Scaffold
only what they pick.

## Step 2: Enable the MCP server

Edit `config/server.ts` (or `config/server.js`). Add an `mcp` key to the object
the config function returns. **Merge** — do not replace existing keys like
`host`, `port`, `app`:

```ts
mcp: { enabled: true },
```

After this, the MCP endpoint is served at `<strapi-url>/mcp`.

## Step 3 (inline path): an example tool in `src/index.ts`

Use `templates/inline/register-snippet.ts` as the guide. It registers one tool,
`get_app_info`, in the app's `register()`. Read that file and merge its body into
the project's existing `src/index.ts` `register()` (don't clobber an existing
`bootstrap()` or other register logic).

The inline tool uses `devModeOnly: true`, so it carries **no admin permission**
and needs no grant — it is exposed only while Strapi runs in development
(autoReload). That is deliberate: an app (as opposed to a plugin) cannot register
its own RBAC action, because `actionProvider.registerMany` validates `pluginName`
against the real registered plugins and throws for anything else. Per-tool RBAC
is shown in the plugin path (Step 4), where the plugin name is real. So the two
paths teach different things: inline = the quickest possible tool (dev-only, no
permission); plugin = a shippable tool with its own grantable permission.

Why `register()` and not `bootstrap()`: the boot order is plugin `register()` →
plugin `bootstrap()` → MCP server starts → app `bootstrap()`. The app's own
`bootstrap()` runs *after* the server has started, and registering then throws.
`register()` is early enough.

## Step 4 (plugin path): generate the plugin

Use the official Strapi generator for the skeleton, then overlay the MCP source.
The generator owns the build config (`package.json`, tsconfigs), so it stays
correct and current; we only add the MCP-specific files.

### 4a. Scaffold with the official CLI (non-interactive)

From the Strapi project root:

```bash
npx @strapi/sdk-plugin@latest init strapi-extended-mcp --silent --use-npm
```

`--silent` is the key: it skips every interactive prompt and uses defaults
(plugin id `strapi-extended-mcp`, TypeScript on, admin + server on), so it runs
headless. Swap `--use-npm` for `--use-yarn` / `--use-pnpm` to match the project.
Because the directory is a Strapi project and the path has no slash, the CLI
creates the plugin at `./src/plugins/strapi-extended-mcp/` and installs + builds
it. (A server-only plugin is enough for MCP tools; the unused admin folder is
harmless. If a future CLI release adds a `--no-admin` flag, prefer it.)

### 4b. Overlay the MCP source

Copy `templates/plugin-overlay/server/src/` over the generated
`src/plugins/strapi-extended-mcp/server/src/`. This **replaces** the default
`register.ts` (which becomes async and registers the permission + tool) and adds
the `mcp/` folder (orchestrator, types, permissions, and the `list_content_types`
tool). Leave the generated `index.ts` alone — it already imports `./register`.

### 4c. Rebuild

The plugin loads from `dist/`, so rebuild after the overlay:

```bash
cd src/plugins/strapi-extended-mcp && npm run build
```

Confirm `dist/server/index.js` exists. If the build fails, stop and report it —
a plugin that didn't build will not load.

### 4d. Enable the plugin

Edit `config/plugins.ts` (create it if missing) and add, merging with any
existing entries:

```ts
'strapi-extended-mcp': {
  enabled: true,
  resolve: './src/plugins/strapi-extended-mcp',
},
```

## Step 5: Verify

Restart Strapi and watch the boot log. `[MCP] Server available at /mcp` confirms
the server started. If you scaffolded the **plugin** path, you'll also see its
own lines:

- `[strapi-extended-mcp plugin] Registered N custom admin permission(s).`
- `[strapi-extended-mcp plugin] Registered N custom MCP tool(s).`

The **inline** path logs nothing of its own (it registers `get_app_info`
silently in `src/index.ts`); confirm it a different way — a `tools/list` call
with a dev token, or just that the app booted clean instead of throwing at
`register()`.

If the server logs an MCP error or the `/mcp` route 404/405s on a POST, the
registration didn't take — re-check Steps 3/4 before telling the user it worked.
There's a smoke-test script pattern in `references/verifying.md`.

## Step 6: Tell the user what's left (it's manual, and it's in the admin)

The **plugin** tool (`list_content_types`) is gated on a real admin permission,
and registering it does **not** grant it. The user finishes in the admin panel,
and this is the step people miss:

1. **Settings → Admin Tokens** (NOT Settings → API Tokens — that's the Content
   API, and the MCP server rejects those with a 401). Create a token.
2. On the token, open the **Plugins** tab, find **Strapi extended mcp**, check
   the tool's permission, then **Save**. Read-only / full-access preset tokens
   do *not* include plugin-registered actions, so use a token whose permission
   tree you can edit (or grant via a role).
3. Connect an MCP client with: URL `<strapi-url>/mcp`, transport
   `streamable-http`, header `Authorization: Bearer <that token>`.

The plugin tool only appears in the client (and is only callable) once its
permission is granted. That's the RBAC contract, working as intended.

The **inline** tool (`get_app_info`) is `devModeOnly`, so it needs **no grant**:
it shows up for any authenticated token while Strapi runs in development, and is
absent in production. Nothing to check in the admin for that one.

## Gotchas (all real; bake these into what you tell the user)

- **5.47.0+ required.** No built-in MCP before it.
- **Import `z` from `@strapi/utils`, not the `zod` package.** Strapi pulls in
  zod 3; a top-level zod 4 will load the wrong copy and crash the schema.
- **The plugin loads from `dist/`.** Every change to plugin source needs
  `npm run build` in the plugin folder and a Strapi restart. An un-built edit
  looks like it did nothing.
- **Admin tokens, not Content API tokens.** Different settings page; only admin
  tokens authenticate against `/mcp`.
- **`actionProvider.registerMany` shape:** `{ section: 'plugins', pluginName,
  uid, displayName }` → the action UID becomes `plugin::<pluginName>.<uid>`.
- **No `.bind()`** is needed on `strapi.ai.mcp.registerTool`; it's a closure, not
  a `this`-method.

## Templates

- `templates/inline/register-snippet.ts` — the inline tool + its permission.
- `templates/plugin-overlay/server/src/` — the MCP source to overlay onto a
  CLI-generated plugin (replaces `register.ts`, adds `mcp/`). The build config and
  `package.json` come from the official generator, not from here.
- `references/verifying.md` — how to smoke-test the endpoint after setup.
