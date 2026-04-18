import fs from "node:fs";
import path from "node:path";
import { GraphStore } from "./graphStore";
import { architectureOverview, detectCommunities, detectFlows } from "./postprocess";

function main(): void {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const store = new GraphStore(root);
  const graph = store.readGraphData();

  const communities = detectCommunities(graph);
  const flows = detectFlows(graph, 100);
  const overview = architectureOverview(graph);

  fs.writeFileSync(path.join(root, "smart-context.communities.json"), JSON.stringify(communities, null, 2));
  fs.writeFileSync(path.join(root, "smart-context.flows.json"), JSON.stringify(flows, null, 2));
  fs.writeFileSync(path.join(root, "smart-context.architecture.json"), JSON.stringify(overview, null, 2));

  console.log("Postprocess complete.");
  console.log("Communities:", communities.length);
  console.log("Flows:", flows.length);
}

main();
