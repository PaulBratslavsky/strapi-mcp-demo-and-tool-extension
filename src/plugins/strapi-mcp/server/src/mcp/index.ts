import type { Core } from "@strapi/strapi";
import { tools } from "./tools";

export const registerMcpTools = (strapi: Core.Strapi) => {
  if (!strapi.ai?.mcp?.isEnabled()) {
    strapi.log.warn(
      "[strapi-mcp plugin] MCP server not enabled — skipping custom registration."
    );
    return;
  }

  const registerTool = strapi.ai.mcp.registerTool.bind(strapi.ai.mcp);
  for (const tool of tools) {
    tool.register(registerTool, strapi);
  }

  strapi.log.info(
    `[strapi-mcp plugin] Registered ${tools.length} custom MCP tool(s).`
  );
};
