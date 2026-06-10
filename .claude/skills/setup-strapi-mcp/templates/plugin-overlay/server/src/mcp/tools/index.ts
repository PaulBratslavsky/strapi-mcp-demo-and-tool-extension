import type { StrapiMcpToolModule } from "../types";
import listContentTypes from "./list-content-types";

// Add a tool: create its file, import it, add it to this array, then add a
// matching action in ../permissions.ts and gate the tool on it.
export const tools: StrapiMcpToolModule[] = [listContentTypes];
