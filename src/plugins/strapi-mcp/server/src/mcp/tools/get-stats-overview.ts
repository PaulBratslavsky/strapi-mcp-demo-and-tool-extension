import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";

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
        policies: [
          {
            action: "plugin::content-manager.explorer.read",
            subject: "api::article.article",
          },
          {
            action: "plugin::content-manager.explorer.read",
            subject: "api::author.author",
          },
          {
            action: "plugin::content-manager.explorer.read",
            subject: "api::category.category",
          },
        ],
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
