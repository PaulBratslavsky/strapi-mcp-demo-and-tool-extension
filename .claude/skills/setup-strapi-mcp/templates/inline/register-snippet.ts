// INLINE TOOL TEMPLATE
//
// Merge the body of register() below into your app's existing src/index.ts.
// Make register() keep any logic you already have — only ADD to it.
//
// This inline example uses `devModeOnly: true`: the tool needs no admin
// permission and no grant step, and it is exposed only while Strapi runs in
// development (autoReload). That keeps the quick inline path quick. When you
// want a tool you ship and gate with RBAC, use the plugin path — it registers a
// dedicated admin permission per tool.
//
// Why a dedicated *app-level* permission is NOT used here: Strapi's
// `actionProvider.registerMany` validates `pluginName` against the real
// registered plugins, so an app (non-plugin) cannot register an action under a
// made-up plugin namespace. Per-tool RBAC therefore lives in the plugin path,
// where the plugin name is real.
//
// Why register() and not bootstrap(): boot order is
//   plugin register() -> plugin bootstrap() -> MCP server starts -> app bootstrap()
// so the app's own bootstrap() runs after the server has started, and
// registering a tool there throws. register() is early enough.

import type { Core } from "@strapi/strapi";
import { z } from "@strapi/utils"; // NOT the top-level "zod" package

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    if (!strapi.ai.mcp.isEnabled()) return;

    strapi.ai.mcp.registerTool({
      name: "get_app_info",
      title: "Get Strapi app info",
      description:
        "Return the Strapi version and the number of api:: content types in this project.",
      devModeOnly: true,
      resolveOutputSchema: () =>
        z.object({
          strapiVersion: z.string(),
          contentTypeCount: z.number().int().nonnegative(),
        }),
      createHandler: (strapi) => async () => {
        const contentTypeCount = Object.keys(strapi.contentTypes).filter((u) =>
          u.startsWith("api::")
        ).length;
        const payload = {
          strapiVersion:
            (strapi.config.get("info.strapi", "unknown") as string) ?? "unknown",
          contentTypeCount,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      },
    });
  },

  bootstrap() {},
};
