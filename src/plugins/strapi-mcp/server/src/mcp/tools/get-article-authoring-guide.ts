import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";
import { ARTICLE_AUTHORING_GUIDE_MD } from "../guides/article-authoring-guide";

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "get_article_authoring_guide",
      title: "Get the article authoring guide",
      description:
        "Return the required output format and section rules for writing articles in this Strapi instance. Call this BEFORE drafting article content, then follow the returned format exactly when constructing `create_article_draft`'s `content_markdown`.",
      resolveOutputSchema: () =>
        z.object({
          guide_markdown: z.string(),
        }),
      auth: {
        policies: [
          {
            action: "plugin::content-manager.explorer.read",
            subject: "api::article.article",
          },
        ],
      },
      createHandler: () => async () => {
        return {
          content: [{ type: "text", text: ARTICLE_AUTHORING_GUIDE_MD }],
          structuredContent: { guide_markdown: ARTICLE_AUTHORING_GUIDE_MD },
        };
      },
    });
  },
};

export default tool;
