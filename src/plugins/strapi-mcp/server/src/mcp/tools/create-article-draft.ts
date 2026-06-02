import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";

const DESCRIPTION_MAX = 80;

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "create_article_draft",
      title: "Create a draft article",
      description:
        "REQUIRED: call `get_article_authoring_guide` FIRST to learn the required output format before writing `content_markdown`. Then save a new article as a draft (not published). The markdown content is wrapped in a single shared.rich-text block. Optionally link an author or category by their slug or display name.",
      resolveInputSchema: () =>
        z.object({
          title: z.string().min(1),
          description: z
            .string()
            .max(
              DESCRIPTION_MAX,
              `description must be ${DESCRIPTION_MAX} characters or fewer — use a short subtitle, not the TL;DR`
            ),
          content_markdown: z.string().min(1),
          slug: z
            .string()
            .optional()
            .describe(
              "Override the auto-generated slug. Omit to let Strapi derive it from title."
            ),
          author_slug: z
            .string()
            .optional()
            .describe("Author slug or name — looked up; silently skipped if not found"),
          category_slug: z
            .string()
            .optional()
            .describe(
              "Category slug or name — looked up; silently skipped if not found"
            ),
        }),
      resolveOutputSchema: () =>
        z.object({
          documentId: z.string(),
          title: z.string(),
          slug: z.string().nullable(),
          status: z.string(),
          linked_author: z.string().nullable(),
          linked_category: z.string().nullable(),
        }),
      auth: {
        policies: [
          {
            action: "plugin::content-manager.explorer.create",
            subject: "api::article.article",
          },
        ],
      },
      createHandler: (strapi) => async ({ args }) => {
        const resolveRelationId = async (
          uid: "api::author.author" | "api::category.category",
          value: string | undefined
        ): Promise<{ id: number; label: string } | null> => {
          if (!value) return null;
          const attrs = (strapi.contentTypes as any)[uid]?.attributes ?? {};
          const candidateFields = ["slug", "name"].filter((f) => f in attrs);
          const docs = strapi.documents(uid as any) as any;
          for (const field of candidateFields) {
            const hit = await docs.findFirst({ filters: { [field]: { $eq: value } } });
            if (hit) return { id: hit.id, label: hit.slug ?? hit.name ?? String(hit.id) };
          }
          return null;
        };

        const author = await resolveRelationId("api::author.author", args.author_slug);
        const category = await resolveRelationId(
          "api::category.category",
          args.category_slug
        );

        const data: Record<string, unknown> = {
          title: args.title,
          description: args.description,
          blocks: [
            {
              __component: "shared.rich-text",
              body: args.content_markdown,
            },
          ],
        };
        if (args.slug) data.slug = args.slug;
        if (author) data.author = author.id;
        if (category) data.category = category.id;

        const created = await (strapi.documents("api::article.article") as any).create({
          data,
          status: "draft",
        });

        const payload = {
          documentId: created.documentId as string,
          title: created.title as string,
          slug: (created.slug ?? null) as string | null,
          status: "draft",
          linked_author: author?.label ?? null,
          linked_category: category?.label ?? null,
        };

        return {
          content: [
            {
              type: "text",
              text: `Draft article "${payload.title}" created (documentId: ${payload.documentId}).`,
            },
          ],
          structuredContent: payload,
        };
      },
    });
  },
};

export default tool;
