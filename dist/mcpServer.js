"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const core_1 = require("./mcp/tools/core");
const review_1 = require("./mcp/tools/review");
const flows_1 = require("./mcp/tools/flows");
const communities_1 = require("./mcp/tools/communities");
const analysis_1 = require("./mcp/tools/analysis");
const registry_1 = require("./mcp/tools/registry");
async function main() {
    const server = new mcp_js_1.McpServer({
        name: "smart-context-map",
        version: "0.3.0",
    });
    (0, core_1.registerCoreTools)(server);
    (0, review_1.registerReviewTools)(server);
    (0, flows_1.registerFlowTools)(server);
    (0, communities_1.registerCommunityTools)(server);
    (0, analysis_1.registerAnalysisTools)(server);
    (0, registry_1.registerRegistryTools)(server);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
void main();
