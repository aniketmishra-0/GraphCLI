"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContextMarkdown = generateContextMarkdown;
exports.generateContextXml = generateContextXml;
exports.generateContextPacket = generateContextPacket;
exports.generateTwoStagePackets = generateTwoStagePackets;
function renderFileSection(graph, file, interfaceOnly, reasons, symbolNameAllowlist) {
    const symbols = graph.symbols.filter((s) => s.file === file);
    const imports = graph.importEdges.filter((e) => e.fromFile === file);
    const filteredSymbols = interfaceOnly
        ? symbols.filter((s) => s.exported || s.kind === "interface" || s.kind === "type")
        : symbols;
    const allowlistedSymbols = symbolNameAllowlist
        ? filteredSymbols.filter((s) => symbolNameAllowlist.has(s.name))
        : filteredSymbols;
    const symbolLines = allowlistedSymbols
        .map((s) => `- ${s.kind} ${s.name} | exported=${s.exported} | loc=${s.locStart}-${s.locEnd} | sig=${s.signature}`)
        .join("\n");
    const importLines = imports
        .map((i) => `- ${i.toFile} :: [${i.specifiers.join(", ")}]`)
        .join("\n");
    return [
        `## FILE: ${file}`,
        `REASONS: ${reasons.join("; ")}`,
        `MODE: ${interfaceOnly ? "interface-only" : "full-symbol-summary"}`,
        "",
        "### Imports",
        importLines || "- (none)",
        "",
        "### Symbols",
        symbolLines || "- (none)",
        "",
    ].join("\n");
}
function renderHotPath(hotPath) {
    const lines = hotPath
        .map((h) => `- ${h.file}: churn=${h.churn}, weighted=${h.weightedChurn.toFixed(3)}`)
        .join("\n");
    return ["# HOT_PATH", lines || "- (none)", ""].join("\n");
}
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function compactSignature(sig, maxLen) {
    const collapsed = sig.replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLen)
        return collapsed;
    return `${collapsed.slice(0, Math.max(0, maxLen - 3))}...`;
}
function modeLimits(mode) {
    if (mode === "ultra") {
        return { importsPerFile: 4, symbolsPerFile: 6, signatureLen: 48, reasonsPerFile: 1 };
    }
    if (mode === "minimal") {
        return { importsPerFile: 6, symbolsPerFile: 10, signatureLen: 80, reasonsPerFile: 2 };
    }
    return { importsPerFile: 10, symbolsPerFile: 20, signatureLen: 120, reasonsPerFile: 3 };
}
function rankFiles(selection, hotPath) {
    return [...selection.includedFiles].sort((a, b) => {
        const aIsTarget = a === selection.targetFile ? 1 : 0;
        const bIsTarget = b === selection.targetFile ? 1 : 0;
        if (aIsTarget !== bIsTarget)
            return bIsTarget - aIsTarget;
        const aHot = hotPath.find((h) => h.file === a)?.weightedChurn ?? 0;
        const bHot = hotPath.find((h) => h.file === b)?.weightedChurn ?? 0;
        return bHot - aHot;
    });
}
function generateContextMarkdown(graph, selection, hotPath, budget) {
    const headers = [
        "# SMART_CONTEXT_MAP",
        `target_file: ${selection.targetFile}`,
        `generated_at: ${graph.generatedAt}`,
        `included_files_count: ${selection.includedFiles.length}`,
        "",
        "# CONTEXT_POLICY",
        "- upstream: include imported definition summaries",
        "- downstream: include interface-only summaries unless explicitly requested",
        "- omit function bodies to reduce token usage",
        `- max_tokens: ${budget.maxTokens}`,
        `- hard_cap: ${budget.hardCap}`,
        "",
    ].join("\n");
    const rankedFiles = rankFiles(selection, hotPath);
    const sections = [];
    let usedTokens = estimateTokens(`${headers}\n${renderHotPath(hotPath)}`);
    for (const file of rankedFiles) {
        const allowlist = selection.prioritizedSymbolsByFile[file]
            ? new Set(selection.prioritizedSymbolsByFile[file])
            : null;
        const section = renderFileSection(graph, file, selection.interfaceOnlyFiles.includes(file), selection.reasonByFile[file] ?? ["unknown"], allowlist);
        const sectionTokens = estimateTokens(section);
        if (budget.hardCap && usedTokens + sectionTokens > budget.maxTokens && file !== selection.targetFile) {
            continue;
        }
        sections.push(section);
        usedTokens += sectionTokens;
    }
    const body = [
        `# TOKEN_USAGE_ESTIMATE`,
        `- estimated_tokens=${usedTokens}`,
        `- budget_tokens=${budget.maxTokens}`,
        "",
        ...sections,
    ].join("\n");
    return `${headers}\n${renderHotPath(hotPath)}\n${body}`;
}
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function generateContextXml(graph, selection, hotPath, budget) {
    const files = selection.includedFiles
        .sort()
        .map((file) => {
        const symbols = graph.symbols
            .filter((s) => s.file === file)
            .map((s) => `<symbol kind="${escapeXml(s.kind)}" name="${escapeXml(s.name)}" exported="${s.exported}" locStart="${s.locStart}" locEnd="${s.locEnd}">${escapeXml(s.signature)}</symbol>`)
            .join("");
        const imports = graph.importEdges
            .filter((e) => e.fromFile === file)
            .map((e) => `<import to="${escapeXml(e.toFile)}" />`)
            .join("");
        const reasons = (selection.reasonByFile[file] ?? ["unknown"])
            .map((r) => `<reason>${escapeXml(r)}</reason>`)
            .join("");
        const mode = selection.interfaceOnlyFiles.includes(file) ? "interface-only" : "full-symbol-summary";
        return `<file path="${escapeXml(file)}" mode="${mode}">${reasons}<imports>${imports}</imports><symbols>${symbols}</symbols></file>`;
    })
        .join("");
    const hot = hotPath
        .map((h) => `<hotFile path="${escapeXml(h.file)}" churn="${h.churn}" weighted="${h.weightedChurn.toFixed(3)}" />`)
        .join("");
    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        `<smartContext generatedAt="${escapeXml(graph.generatedAt)}" targetFile="${escapeXml(selection.targetFile)}" maxTokens="${budget.maxTokens}" hardCap="${budget.hardCap}">`,
        `<hotPath>${hot}</hotPath>`,
        `<files>${files}</files>`,
        "</smartContext>",
    ].join("");
}
function generateContextPacket(graph, selection, hotPath, budget, provider, compression) {
    const limits = modeLimits(compression);
    const rankedFiles = rankFiles(selection, hotPath);
    const packet = {
        v: 1,
        p: provider,
        c: compression,
        t: selection.targetFile,
        b: budget.maxTokens,
        g: graph.generatedAt,
        h: hotPath.slice(0, 6).map((x) => [x.file, Number(x.weightedChurn.toFixed(3))]),
        f: [],
    };
    for (const file of rankedFiles) {
        const symbols = graph.symbols
            .filter((s) => s.file === file)
            .filter((s) => {
            if (!selection.interfaceOnlyFiles.includes(file))
                return true;
            return s.exported || s.kind === "interface" || s.kind === "type";
        })
            .slice(0, limits.symbolsPerFile)
            .map((s) => ({
            n: s.name,
            k: s.kind,
            e: (s.exported ? 1 : 0),
            l: `${s.locStart}-${s.locEnd}`,
            sg: compactSignature(s.signature, limits.signatureLen),
        }));
        const imports = graph.importEdges
            .filter((e) => e.fromFile === file)
            .slice(0, limits.importsPerFile)
            .map((e) => e.toFile);
        packet.f.push({
            p: file,
            m: selection.interfaceOnlyFiles.includes(file) ? "i" : "f",
            r: (selection.reasonByFile[file] ?? ["u"]).slice(0, limits.reasonsPerFile),
            i: imports,
            s: symbols,
        });
    }
    let serialized = JSON.stringify(packet);
    if (!budget.hardCap) {
        return serialized;
    }
    const trimStrategies = [
        () => {
            for (const f of packet.f) {
                for (const s of f.s) {
                    delete s.sg;
                }
            }
        },
        () => {
            for (const f of packet.f) {
                if (f.p !== selection.targetFile) {
                    f.s = f.s.slice(0, Math.max(1, Math.floor(f.s.length / 2)));
                }
            }
        },
        () => {
            for (const f of packet.f) {
                if (f.p !== selection.targetFile) {
                    f.i = [];
                }
            }
        },
        () => {
            packet.f = packet.f.filter((f, idx) => f.p === selection.targetFile || idx < 3);
        },
    ];
    for (const strategy of trimStrategies) {
        if (estimateTokens(serialized) <= budget.maxTokens)
            break;
        strategy();
        serialized = JSON.stringify(packet);
    }
    return serialized;
}
function generateTwoStagePackets(graph, selection, hotPath, budget, provider, compression) {
    const stage1Budget = {
        maxTokens: Math.max(220, Math.floor(budget.maxTokens * 0.3)),
        hardCap: true,
    };
    const stage2Budget = {
        maxTokens: Math.max(stage1Budget.maxTokens + 180, Math.floor(budget.maxTokens * 0.9)),
        hardCap: budget.hardCap,
    };
    const stage1 = generateContextPacket(graph, selection, hotPath, stage1Budget, provider, "ultra");
    const stage2 = generateContextPacket(graph, selection, hotPath, stage2Budget, provider, compression);
    return { stage1, stage2 };
}
