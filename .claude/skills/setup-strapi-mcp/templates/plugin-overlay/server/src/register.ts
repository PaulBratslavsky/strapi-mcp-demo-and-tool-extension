import type { Core } from "@strapi/strapi";
import { registerMcpPermissions } from "./mcp/permissions";
import { registerMcpTools } from "./mcp";

const register = async ({ strapi }: { strapi: Core.Strapi }) => {
  await registerMcpPermissions(strapi);
  registerMcpTools(strapi);
};

export default register;
