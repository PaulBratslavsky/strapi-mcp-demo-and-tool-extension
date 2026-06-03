import type { Core } from "@strapi/strapi";

const PLUGIN_NAME = "strapi-extended-mcp";

// One admin RBAC action per custom tool, so an admin can expose each tool
// independently from the Plugins tab of an admin token. Action UIDs come out as
// `plugin::strapi-extended-mcp.<uid>`, e.g. `plugin::strapi-extended-mcp.stats.read`.
const ACTION_DEFS = [
  { uid: "stats.read", displayName: "Read content stats overview" },
  { uid: "articles.read", displayName: "List recent articles" },
  { uid: "api-docs.read", displayName: "Read Content API documentation" },
  { uid: "guide.read", displayName: "Read the article authoring guide" },
  { uid: "info.read", displayName: "Read extended MCP plugin info" },
] as const;

// Strongly-typed action UID constants for tools to gate on. Keeping them here
// means a tool and its permission can't drift apart.
export const MCP_ACTIONS = {
  STATS_READ: `plugin::${PLUGIN_NAME}.stats.read`,
  ARTICLES_READ: `plugin::${PLUGIN_NAME}.articles.read`,
  API_DOCS_READ: `plugin::${PLUGIN_NAME}.api-docs.read`,
  GUIDE_READ: `plugin::${PLUGIN_NAME}.guide.read`,
  INFO_READ: `plugin::${PLUGIN_NAME}.info.read`,
} as const;

export const registerMcpPermissions = async (strapi: Core.Strapi) => {
  const actions = ACTION_DEFS.map((a) => ({
    section: "plugins",
    pluginName: PLUGIN_NAME,
    uid: a.uid,
    displayName: a.displayName,
  }));
  await strapi
    .service("admin::permission")
    .actionProvider.registerMany(actions as unknown as any[]);
  strapi.log.info(
    `[strapi-extended-mcp plugin] Registered ${actions.length} custom admin permission(s).`
  );
};
