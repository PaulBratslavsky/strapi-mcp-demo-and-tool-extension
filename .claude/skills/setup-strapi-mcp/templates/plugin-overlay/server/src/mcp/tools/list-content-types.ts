import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";
import { MCP_ACTIONS } from "../permissions";

// Content-agnostic example tool: lists the project's api:: content types.
// Works on any Strapi v5 project. Gated on the plugin's own admin permission.
const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "list_content_types",
      title: "List API content types",
      description:
        "Return the UID and kind of every api:: content type in this Strapi project.",
      resolveOutputSchema: () =>
        z.object({
          count: z.number().int().nonnegative(),
          contentTypes: z.array(
            z.object({ uid: z.string(), kind: z.string() })
          ),
        }),
      auth: {
        policies: [{ action: MCP_ACTIONS.CONTENT_TYPES_READ }],
      },
      createHandler: (strapi) => async () => {
        const contentTypes = Object.keys(strapi.contentTypes)
          .filter((uid) => uid.startsWith("api::"))
          .map((uid) => ({
            uid,
            kind: (strapi.contentTypes as any)[uid].kind ?? "collectionType",
          }));
        const payload = { count: contentTypes.length, contentTypes };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      },
    });
  },
};

export default tool;
