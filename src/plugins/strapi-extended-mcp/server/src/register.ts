import type { Core } from "@strapi/strapi";
import { registerMcpTools } from "./mcp";
import { registerMcpPermissions } from "./mcp/permissions";

const register = async ({ strapi }: { strapi: Core.Strapi }) => {
  await registerMcpPermissions(strapi);
  registerMcpTools(strapi);
};

export default register;
