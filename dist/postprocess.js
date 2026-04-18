"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectCommunities = detectCommunities;
exports.detectFlows = detectFlows;
exports.architectureOverview = architectureOverview;
function buildUndirected(graph) {
    const adj = new Map();
    for (const f of graph.files)
        adj.set(f, new Set());
    for (const e of graph.importEdges) {
        if (!adj.has(e.fromFile))
            adj.set(e.fromFile, new Set());
        if (!adj.has(e.toFile))
            adj.set(e.toFile, new Set());
        adj.get(e.fromFile).add(e.toFile);
        adj.get(e.toFile).add(e.fromFile);
    }
    return adj;
}
function detectCommunities(graph) {
    const adj = buildUndirected(graph);
    const visited = new Set();
    const communities = [];
    let id = 1;
    for (const node of adj.keys()) {
        if (visited.has(node))
            continue;
        const queue = [node];
        const members = [];
        visited.add(node);
        while (queue.length > 0) {
            const current = queue.shift();
            members.push(current);
            const neighbors = adj.get(current) ?? new Set();
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    visited.add(n);
                    queue.push(n);
                }
            }
        }
        let edgeCount = 0;
        const memberSet = new Set(members);
        for (const e of graph.importEdges) {
            if (memberSet.has(e.fromFile) && memberSet.has(e.toFile)) {
                edgeCount += 1;
            }
        }
        communities.push({
            id: `community-${id}`,
            files: members.sort(),
            edgeCount,
        });
        id += 1;
    }
    return communities.sort((a, b) => b.files.length - a.files.length);
}
function detectFlows(graph, limit = 20) {
    const outMap = new Map();
    const inDegree = new Map();
    for (const f of graph.files) {
        outMap.set(f, []);
        inDegree.set(f, 0);
    }
    for (const e of graph.importEdges) {
        if (!outMap.has(e.fromFile))
            outMap.set(e.fromFile, []);
        outMap.get(e.fromFile).push(e.toFile);
        inDegree.set(e.toFile, (inDegree.get(e.toFile) ?? 0) + 1);
    }
    const starts = [...outMap.keys()]
        .filter((f) => (inDegree.get(f) ?? 0) === 0)
        .slice(0, Math.max(limit, 10));
    const flows = [];
    let id = 1;
    for (const s of starts) {
        const queue = [{ file: s, depth: 0, path: [s] }];
        const seen = new Set([s]);
        let bestPath = [s];
        let bestDepth = 0;
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.depth > bestDepth) {
                bestDepth = current.depth;
                bestPath = current.path;
            }
            if (current.depth >= 6)
                continue;
            for (const n of outMap.get(current.file) ?? []) {
                if (seen.has(`${current.file}->${n}`))
                    continue;
                seen.add(`${current.file}->${n}`);
                queue.push({ file: n, depth: current.depth + 1, path: [...current.path, n] });
            }
        }
        const criticality = bestPath.length + (outMap.get(s)?.length ?? 0);
        flows.push({
            id: `flow-${id}`,
            name: `Flow from ${s}`,
            startFile: s,
            depth: bestDepth,
            path: bestPath,
            criticality,
        });
        id += 1;
    }
    return flows.sort((a, b) => b.criticality - a.criticality).slice(0, limit);
}
function architectureOverview(graph) {
    const communities = detectCommunities(graph);
    const flows = detectFlows(graph, 10);
    return {
        communities: communities.length,
        topCommunities: communities.slice(0, 6).map((c) => ({ id: c.id, files: c.files.length, edgeCount: c.edgeCount })),
        topFlows: flows.slice(0, 6).map((f) => ({
            id: f.id,
            criticality: f.criticality,
            depth: f.depth,
            startFile: f.startFile,
        })),
    };
}
