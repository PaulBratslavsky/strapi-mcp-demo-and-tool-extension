import { z } from "@strapi/utils";
import type { StrapiMcpToolModule } from "../types";
import { MCP_ACTIONS } from "../permissions";

// Maps a Strapi attribute to a short, LLM-friendly type string.
const describeAttribute = (attr: any): string => {
  if (!attr || typeof attr !== "object") return "unknown";
  switch (attr.type) {
    case "relation":
      return `relation(${attr.relation} -> ${attr.target})`;
    case "component":
      return `component(${attr.component}${attr.repeatable ? "[]" : ""})`;
    case "dynamiczone":
      return `dynamiczone(${(attr.components ?? []).join(" | ")})`;
    case "media":
      return `media(${attr.multiple ? "multiple" : "single"})`;
    case "enumeration":
      return `enum(${(attr.enum ?? []).join(" | ")})`;
    default:
      return attr.type ?? "unknown";
  }
};

const tool: StrapiMcpToolModule = {
  register(registerTool) {
    registerTool({
      name: "get_content_api_docs",
      title: "Get Content API documentation",
      description:
        "List every Content API (api::*) content type with its REST endpoints and field schema. Call this to learn what the REST API exposes before constructing api::* requests or building tools against it.",
      resolveInputSchema: () =>
        z.object({
          uid: z
            .string()
            .optional()
            .describe(
              "Limit the output to a single content type by UID, e.g. 'api::article.article'. Omit to list all."
            ),
        }),
      resolveOutputSchema: () =>
        z.object({
          count: z.number().int().nonnegative(),
          contentTypes: z.array(
            z.object({
              uid: z.string(),
              kind: z.string(),
              singularName: z.string().nullable(),
              pluralName: z.string().nullable(),
              draftAndPublish: z.boolean(),
              endpoints: z.array(z.string()),
              attributes: z.array(
                z.object({
                  name: z.string(),
                  type: z.string(),
                  required: z.boolean(),
                })
              ),
            })
          ),
        }),
      auth: {
        policies: [{ action: MCP_ACTIONS.API_DOCS_READ }],
      },
      createHandler: (strapi) => async ({ args }) => {
        const allUids = Object.keys(strapi.contentTypes).filter((uid) =>
          uid.startsWith("api::")
        );
        const uids = args?.uid
          ? allUids.filter((u) => u === args.uid)
          : allUids;

        const contentTypes = uids.map((uid) => {
          const ct = (strapi.contentTypes as any)[uid];
          const info = ct.info ?? {};
          const pluralName: string | null = info.pluralName ?? null;
          const singularName: string | null = info.singularName ?? null;
          const isSingle = ct.kind === "singleType";

          // Mirror Strapi's default core-router REST paths. Single types are
          // served under the singular name (/api/global); collection types
          // under the plural name (/api/articles).
          const endpoints: string[] = [];
          if (isSingle && singularName) {
            const base = `/api/${singularName}`;
            endpoints.push(`GET ${base}`, `PUT ${base}`, `DELETE ${base}`);
          } else if (!isSingle && pluralName) {
            const base = `/api/${pluralName}`;
            endpoints.push(
              `GET ${base}`,
              `POST ${base}`,
              `GET ${base}/:documentId`,
              `PUT ${base}/:documentId`,
              `DELETE ${base}/:documentId`
            );
          }

          const attributes = Object.entries(ct.attributes ?? {}).map(
            ([name, attr]: [string, any]) => ({
              name,
              type: describeAttribute(attr),
              required: Boolean(attr?.required),
            })
          );

          return {
            uid,
            kind: ct.kind ?? "collectionType",
            singularName: info.singularName ?? null,
            pluralName,
            draftAndPublish: Boolean(ct.options?.draftAndPublish),
            endpoints,
            attributes,
          };
        });

        const payload = { count: contentTypes.length, contentTypes };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      },
    });
  },
};

export default tool;
