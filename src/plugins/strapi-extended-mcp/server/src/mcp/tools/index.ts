import type { StrapiMcpToolModule } from "../types";
import listRecentArticles from "./list-recent-articles";
import getContentApiDocs from "./get-content-api-docs";
import getArticleAuthoringGuide from "./get-article-authoring-guide";
import getExtendedMcpInfo from "./get-extended-mcp-info";

export const tools: StrapiMcpToolModule[] = [
  listRecentArticles,
  getContentApiDocs,
  getArticleAuthoringGuide,
  getExtendedMcpInfo,
];
