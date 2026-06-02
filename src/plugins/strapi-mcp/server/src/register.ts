import type { Core } from "@strapi/strapi";
import { registerMcpTools } from "./mcp";

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  registerMcpTools(strapi);
};

export default register;
