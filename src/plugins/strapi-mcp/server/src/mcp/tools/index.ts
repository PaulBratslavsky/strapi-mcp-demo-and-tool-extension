import type { StrapiMcpToolModule } from "../types";
import getStatsOverview from "./get-stats-overview";
import listRecentArticles from "./list-recent-articles";
import getArticleAuthoringGuide from "./get-article-authoring-guide";
import createArticleDraft from "./create-article-draft";

export const tools: StrapiMcpToolModule[] = [
  getStatsOverview,
  listRecentArticles,
  getArticleAuthoringGuide,
  createArticleDraft,
];
