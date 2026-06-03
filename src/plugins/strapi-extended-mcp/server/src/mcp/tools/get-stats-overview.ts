import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";
import { MCP_ACTIONS } from "../permissions";

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "get_stats_overview",
      title: "Get content stats overview",
      description:
        "Return aggregate counts of published articles, authors, and categories.",
      resolveOutputSchema: () =>
        z.object({
          articles: z.number().int().nonnegative(),
          authors: z.number().int().nonnegative(),
          categories: z.number().int().nonnegative(),
        }),
      auth: {
        policies: [{ action: MCP_ACTIONS.STATS_READ }],
      },
      createHandler: (strapi) => async () => {
        const overview = await strapi
          .service("api::stats.stats")
          .overview();
        return {
          content: [{ type: "text", text: JSON.stringify(overview) }],
          structuredContent: overview,
        };
      },
    });
  },
};

export default tool;
