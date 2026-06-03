import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";
import { MCP_ACTIONS } from "../permissions";

// Demonstrates gating a tool on the plugin's OWN admin permission
// (`plugin::strapi-extended-mcp.info.read`) instead of borrowing content-manager's
// `explorer.*` actions. A token only sees this tool if that permission has been
// granted to it, so it stays independent of the built-in content-type tooling.
const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "get_extended_mcp_info",
      title: "Get extended MCP plugin info",
      description:
        "Return metadata about this plugin: its name and the admin permission this tool is gated on. Useful for confirming the dedicated-permission setup. Gated on the plugin's own admin permission, not content-manager permissions.",
      resolveOutputSchema: () =>
        z.object({
          plugin: z.string(),
          gatedOn: z.string(),
        }),
      createHandler: () => async () => {
        const payload = {
          plugin: "strapi-extended-mcp",
          gatedOn: MCP_ACTIONS.INFO_READ,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      },
      auth: {
        policies: [{ action: MCP_ACTIONS.INFO_READ }],
      },
    });
  },
};

export default tool;
