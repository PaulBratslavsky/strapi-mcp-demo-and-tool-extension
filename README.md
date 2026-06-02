# strapi-with-content

A [Strapi 5](https://strapi.io) backend preloaded with blog content types and seed data, plus three things that go beyond a stock Strapi install:

- **A custom MCP server plugin** (`strapi-mcp`) that exposes the content API as [Model Context Protocol](https://modelcontextprotocol.io) tools, so an AI assistant can list, draft, and publish articles.
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

## The `strapi-mcp` plugin

A local plugin at `src/plugins/strapi-mcp` that surfaces the content API as MCP tools — listing, creating drafts, publishing, and managing articles, authors, and categories — so an AI client (such as Claude) can author content directly against this instance. Articles created through the plugin follow a fixed blog template (TL;DR, body, citations) enforced by its authoring guide.

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
# strapi-mcp-demo-and-tool-extension
