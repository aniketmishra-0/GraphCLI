// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCoreTools } from "./mcp/tools/core";
import { registerReviewTools } from "./mcp/tools/review";
import { registerFlowTools } from "./mcp/tools/flows";
import { registerCommunityTools } from "./mcp/tools/communities";
import { registerAnalysisTools } from "./mcp/tools/analysis";
import { registerRegistryTools } from "./mcp/tools/registry";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "smart-context-map",
    version: "0.3.0",
  });

  registerCoreTools(server);
  registerReviewTools(server);
  registerFlowTools(server);
  registerCommunityTools(server);
  registerAnalysisTools(server);
  registerRegistryTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
