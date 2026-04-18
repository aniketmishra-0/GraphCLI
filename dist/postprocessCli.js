"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const graphStore_1 = require("./graphStore");
const postprocess_1 = require("./postprocess");
function main() {
    const root = node_path_1.default.resolve(process.argv[2] ?? process.cwd());
    const store = new graphStore_1.GraphStore(root);
    const graph = store.readGraphData();
    const communities = (0, postprocess_1.detectCommunities)(graph);
    const flows = (0, postprocess_1.detectFlows)(graph, 100);
    const overview = (0, postprocess_1.architectureOverview)(graph);
    node_fs_1.default.writeFileSync(node_path_1.default.join(root, "smart-context.communities.json"), JSON.stringify(communities, null, 2));
    node_fs_1.default.writeFileSync(node_path_1.default.join(root, "smart-context.flows.json"), JSON.stringify(flows, null, 2));
    node_fs_1.default.writeFileSync(node_path_1.default.join(root, "smart-context.architecture.json"), JSON.stringify(overview, null, 2));
    console.log("Postprocess complete.");
    console.log("Communities:", communities.length);
    console.log("Flows:", flows.length);
}
main();
