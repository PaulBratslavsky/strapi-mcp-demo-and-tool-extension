# Verifying the MCP setup

After scaffolding, prove the setup actually works before telling the user it's
done. Two layers: the server boots and registers, then a tool is reachable.

## 1. Boot log

Start Strapi (`npm run develop`) and watch for:

```
[strapi-extended-mcp plugin] Registered N custom admin permission(s).   (plugin path)
[strapi-extended-mcp plugin] Registered N custom MCP tool(s).           (plugin path)
[MCP] Server available at /mcp
```

If you see an `[MCP] Failed to start` error, or a POST to `/mcp` returns 404/405,
registration didn't take. Re-check that the tool was registered in `register()`
(not the app's `bootstrap()`), and that the plugin built to `dist/`.

## 2. Endpoint smoke test

The `/mcp` endpoint speaks JSON-RPC over an SSE-framed response. A POST without a
valid admin token returns 401; with one it returns tool data.

```bash
# 401 expected (no token) — proves the route is mounted
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:1337/mcp \
  -H 'content-type: application/json' -d '{}'

# With an admin token that has the tool's permission granted:
curl -s -X POST http://localhost:1337/mcp \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. The RBAC contract

A tool only appears in `tools/list` (and is only callable) once its permission is
granted to the token in Settings → Admin Tokens → Plugins. A token that lacks the
permission will not see the tool, and calling it by name returns
`Tool <name> disabled`. That is the gating working, not a bug — confirm the
permission is checked in the admin before assuming something is broken.
