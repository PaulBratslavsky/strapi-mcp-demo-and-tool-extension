import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "list_recent_articles",
      title: "List recent articles",
      description:
        "Return the most recently published articles, newest first. Supports an optional limit (default 5, max 25).",
      resolveInputSchema: () =>
        z.object({
          limit: z.number().int().min(1).max(25).optional(),
        }),
      resolveOutputSchema: () =>
        z.object({
          count: z.number().int().nonnegative(),
          articles: z.array(
            z.object({
              documentId: z.string(),
              title: z.string(),
              slug: z.string().nullable(),
              description: z.string().nullable(),
              author: z.string().nullable(),
              category: z.string().nullable(),
              publishedAt: z.string().nullable(),
            })
          ),
        }),
      auth: {
        policies: [
          {
            action: "plugin::content-manager.explorer.read",
            subject: "api::article.article",
          },
        ],
      },
      createHandler: (strapi) => async ({ args }) => {
        const limit = args?.limit ?? 5;
        const entries = await strapi
          .documents("api::article.article")
          .findMany({
            status: "published",
            sort: { publishedAt: "desc" },
            limit,
            populate: {
              author: { fields: ["name"] },
              category: { fields: ["name"] },
            },
            fields: ["title", "slug", "description", "publishedAt"],
          });

        const articles = entries.map((e: any) => ({
          documentId: e.documentId,
          title: e.title ?? "",
          slug: e.slug ?? null,
          description: e.description ?? null,
          author: e.author?.name ?? null,
          category: e.category?.name ?? null,
          publishedAt: e.publishedAt ? new Date(e.publishedAt).toISOString() : null,
        }));

        const payload = { count: articles.length, articles };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          structuredContent: payload,
        };
      },
    });
  },
};

export default tool;
