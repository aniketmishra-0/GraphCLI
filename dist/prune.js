"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneDependencies = pruneDependencies;
function addReason(reasonMap, file, reason) {
    if (!reasonMap.has(file)) {
        reasonMap.set(file, []);
    }
    reasonMap.get(file).push(reason);
}
function buildAdjacency(graph) {
    const upstream = new Map();
    const downstream = new Map();
    for (const edge of graph.importEdges) {
        if (!upstream.has(edge.fromFile))
            upstream.set(edge.fromFile, new Set());
        if (!downstream.has(edge.toFile))
            downstream.set(edge.toFile, new Set());
        upstream.get(edge.fromFile).add(edge.toFile);
        downstream.get(edge.toFile).add(edge.fromFile);
    }
    return { upstream, downstream };
}
function bfs(startFile, adjacency, maxDepth, reasonPrefix) {
    const visited = new Set([startFile]);
    const files = new Set([startFile]);
    const reasonMap = new Map();
    const queue = [{ file: startFile, depth: 0 }];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current.depth >= maxDepth)
            continue;
        const neighbors = adjacency.get(current.file) ?? new Set();
        for (const n of neighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                files.add(n);
                addReason(reasonMap, n, `${reasonPrefix}:${current.file}`);
                queue.push({ file: n, depth: current.depth + 1 });
            }
        }
    }
    return { files, reasonMap };
}
function pruneDependencies(graph, targetFile, upstreamDepth, downstreamDepth, targetSymbol) {
    const { upstream, downstream } = buildAdjacency(graph);
    const up = bfs(targetFile, upstream, upstreamDepth, "upstream_import");
    const down = bfs(targetFile, downstream, downstreamDepth, "downstream_usage");
    const included = new Set([...up.files, ...down.files]);
    const reasonMap = new Map();
    for (const [file, reasons] of up.reasonMap.entries()) {
        reasonMap.set(file, [...(reasonMap.get(file) ?? []), ...reasons]);
    }
    for (const [file, reasons] of down.reasonMap.entries()) {
        reasonMap.set(file, [...(reasonMap.get(file) ?? []), ...reasons]);
    }
    addReason(reasonMap, targetFile, "target");
    // Downstream files are often high fan-out. Include only public contracts by default.
    const interfaceOnlyFiles = new Set();
    for (const f of down.files) {
        if (f !== targetFile) {
            interfaceOnlyFiles.add(f);
        }
    }
    const prioritizedSymbolsByFile = {};
    if (targetSymbol) {
        const matchedTargetSymbols = graph.symbols.filter((s) => s.file === targetFile && s.name.toLowerCase().includes(targetSymbol.toLowerCase()));
        if (matchedTargetSymbols.length > 0) {
            prioritizedSymbolsByFile[targetFile] = matchedTargetSymbols.map((s) => s.name);
            const calleeNames = new Set();
            for (const edge of graph.callEdges) {
                if (matchedTargetSymbols.some((t) => t.id === edge.callerSymbolId)) {
                    calleeNames.add(edge.calleeName);
                }
            }
            for (const file of included) {
                const symbolsInFile = graph.symbols.filter((s) => s.file === file);
                const prioritized = symbolsInFile
                    .filter((s) => calleeNames.has(s.name) || calleeNames.has(s.name.split(".").pop() ?? ""))
                    .map((s) => s.name);
                if (prioritized.length > 0) {
                    prioritizedSymbolsByFile[file] = [...new Set(prioritized)];
                }
            }
        }
    }
    return {
        targetFile,
        includedFiles: [...included],
        interfaceOnlyFiles: [...interfaceOnlyFiles],
        reasonByFile: Object.fromEntries(reasonMap.entries()),
        prioritizedSymbolsByFile,
    };
}
