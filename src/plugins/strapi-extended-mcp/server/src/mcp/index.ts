import type { Core } from "@strapi/strapi";
import { tools } from "./tools";

export const registerMcpTools = (strapi: Core.Strapi) => {
  if (!strapi.ai.mcp.isEnabled()) {
    strapi.log.warn(
      "[strapi-extended-mcp plugin] MCP server not enabled — skipping custom registration."
    );
    return;
  }

  // registerTool is a closure on the service, not a this-method, so it can be
  // passed around directly — no bind needed.
  const { registerTool } = strapi.ai.mcp;
  for (const tool of tools) {
    tool.register(registerTool, strapi);
  }

  strapi.log.info(
    `[strapi-extended-mcp plugin] Registered ${tools.length} custom MCP tool(s).`
  );
};
