# strapi-with-content

A [Strapi 5](https://strapi.io) backend preloaded with blog content types and seed data, plus three things that go beyond a stock Strapi install:

- **The built-in MCP server, extended two ways** — one custom tool registered **inline** in `src/index.ts`, plus a **`strapi-extended-mcp` plugin** that adds several more — so an AI assistant (Claude, Cursor, Windsurf) can work against this instance over [Model Context Protocol](https://modelcontextprotocol.io). This is the subject of the [companion blog post](./BLOG-strapi-mcp-custom-tools.md).
- **Better Auth** wired in via the Strapi-community plugins, replacing the default users-permissions auth.
- **A custom `/api/stats` endpoint** that returns an overview of the content in the instance.

## Content model

| Type | Kind | Purpose |
| --- | --- | --- |
| Article | collection | Blog posts (rich-text `blocks`, cover, author, category) |
| Author | collection | Post authors, with avatar |
| Category | collection | Post categories |
| About | single | About page content |
| Global | single | Site-wide settings |

Shared components live in `src/components/shared`.

## Requirements

- Node.js `>=20.0.0 <=24.x.x`
- npm `>=6.0.0`

The project uses SQLite (`better-sqlite3`) out of the box — no external database needed to get started.

## Getting started

```bash
npm install
npm run develop
```

`develop` starts Strapi with autoReload enabled. On first run, create your admin user at [http://localhost:1337/admin](http://localhost:1337/admin).

### Seed example content

```bash
npm run seed:example
```

Runs `scripts/seed.js` to populate articles, authors, and categories (with placeholder images).

## Scripts

| Command | Description |
| --- | --- |
| `npm run develop` | Start Strapi with autoReload ([docs](https://docs.strapi.io/dev-docs/cli#strapi-develop)) |
| `npm run start` | Start Strapi with autoReload disabled ([docs](https://docs.strapi.io/dev-docs/cli#strapi-start)) |
| `npm run build` | Build the admin panel ([docs](https://docs.strapi.io/dev-docs/cli#strapi-build)) |
| `npm run seed:example` | Seed example content |
| `npm run console` | Open the Strapi console |
| `npm run upgrade` | Upgrade to the latest Strapi version |
| `npm run deploy` | Deploy to [Strapi Cloud](https://cloud.strapi.io) |

## MCP server and custom tools

Strapi 5.47+ ships an MCP server **built in**. It's enabled here in `config/server.ts` (`mcp: { enabled: true }`) and served at `/mcp`; out of the box it auto-derives CRUD tools for every content type (list/get/create/update/publish…). This project then **extends** it with custom tools in the two ways walked through in the [companion blog post](./BLOG-strapi-mcp-custom-tools.md):

**1. Inline, at the app level — `src/index.ts`.** The app's `register()` hook registers one custom tool, `get_stats_overview` (it wraps the `/api/stats` service), gated on an **app-level** admin permission (`api::stats-overview.read`, granted on an Admin Token's **Settings** tab). This is the quickest way when you only have a tool or two.

**2. As a plugin — `src/plugins/strapi-extended-mcp`.** A local server plugin that registers four more tools, each gated on its **own** plugin permission (`plugin::strapi-extended-mcp.*`, granted on the **Plugins** tab):

- `list_recent_articles` — recent published articles with author/category.
- `get_article_authoring_guide` — the house format an AI follows before writing (TL;DR, body, citations); the model then saves with the **built-in** `create_article`.
- `get_content_api_docs` — a short Content API reference.
- `get_extended_mcp_info` — plugin metadata.

Notes: the MCP server uses **Admin API Tokens** (not Content API tokens), and a token only sees the tools its permissions grant. The plugin loads from its `dist/`, so run `npm run build` in `src/plugins/strapi-extended-mcp` after changing its source, then restart Strapi.

## Authentication

Auth is handled by [Better Auth](https://www.better-auth.com/) through the Strapi-community plugins:

- `@strapi-community/plugin-better-auth`
- `@strapi-community/plugin-api-permissions`
- `@strapi-community/plugin-better-auth-dashboard`

Configuration lives in `src/lib/auth.ts` and `src/extensions/better-auth`. Note this replaces Strapi's default users-permissions plugin.

## Custom stats endpoint

`GET /api/stats` returns an overview of the content in the instance. See `src/api/stats`.

## Deployment

Strapi offers several deployment options, including [Strapi Cloud](https://cloud.strapi.io). See the [deployment docs](https://docs.strapi.io/dev-docs/deployment) for the best fit, or:

```bash
npm run deploy
```

## Learn more

- [Strapi documentation](https://docs.strapi.io)
- [Strapi tutorials](https://strapi.io/tutorials)
- [Strapi blog](https://strapi.io/blog)
- [Strapi GitHub repository](https://github.com/strapi/strapi)

## Community

- [Discord](https://discord.strapi.io)
- [Forum](https://forum.strapi.io/)
- [Awesome Strapi](https://github.com/strapi/awesome-strapi)

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
