import type { Core } from "@strapi/strapi";

export type RegisterTool = Core.Strapi["ai"]["mcp"]["registerTool"];

export type StrapiMcpToolModule = {
  register: (registerTool: RegisterTool, strapi: Core.Strapi) => void;
};
