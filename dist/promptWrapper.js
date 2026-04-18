"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSingleStagePromptWrapper = buildSingleStagePromptWrapper;
exports.buildTwoStagePromptWrapper = buildTwoStagePromptWrapper;
function providerGuidance(provider) {
    if (provider === "claude") {
        return "Model target: Claude. Prefer concise structural reasoning and avoid reading full repository context.";
    }
    if (provider === "chatgpt" || provider === "gpt" || provider === "codex" || provider === "copilot") {
        return "Model target: GPT. Prefer strict step-wise retrieval and keep answer grounded in packet fields only.";
    }
    if (provider === "gemini") {
        return "Model target: Gemini. Keep context bounded and request stage-2 only if definition-level detail is missing.";
    }
    if (provider === "cursor" || provider === "windsurf" || provider === "continue" || provider === "kiro") {
        return "Model target: IDE coding assistant. Use stage-1 first and fetch stage-2 only for unresolved symbols.";
    }
    if (provider === "deepseek" || provider === "qwen" || provider === "mistral" || provider === "grok") {
        return "Model target: OSS/foundation LLM. Keep packet-centric reasoning and avoid speculative expansion beyond graph evidence.";
    }
    if (provider === "perplexity") {
        return "Model target: Retrieval-heavy LLM. Prioritize packet evidence over external web-style retrieval unless explicitly asked.";
    }
    return "Model target: Auto/Other. Enforce strict token discipline and avoid broad code scans.";
}
function buildSingleStagePromptWrapper(provider, task, packetPath, tokenHints) {
    const tokenLines = tokenHints
        ? [
            "",
            "Token Tracking (estimated):",
            `- budget_tokens: ${tokenHints.budgetTokens}`,
            `- prompt_1_used_tokens: ${tokenHints.packetTokens}`,
            `- prompt_1_remaining_tokens: ${Math.max(0, tokenHints.budgetTokens - tokenHints.packetTokens)}`,
            "- note: remaining token window can be used for the assistant response and follow-up.",
        ]
        : [];
    return [
        "# SMART CONTEXT PROMPT WRAPPER",
        "",
        providerGuidance(provider),
        `Task: ${task}`,
        "",
        "Rules:",
        "1. Use only the packet context. Do not request full-codebase reads.",
        "2. If a critical definition is missing, ask only for the specific symbol/file.",
        "3. Keep response concise and grounded to packet evidence.",
        "",
        "Input Packet:",
        `- ${packetPath}`,
        "",
        "Expected Output:",
        "- Key findings",
        "- Risk level",
        "- Exact follow-up data needed (if any)",
        ...tokenLines,
    ].join("\n");
}
function buildTwoStagePromptWrapper(provider, task, stage1Path, stage2Path, tokenHints) {
    const stage1Remaining = tokenHints
        ? Math.max(0, tokenHints.budgetTokens - tokenHints.stage1PacketTokens)
        : null;
    const stage2Remaining = tokenHints
        ? Math.max(0, tokenHints.budgetTokens - tokenHints.stage2PacketTokens)
        : null;
    const tokenLines = tokenHints
        ? [
            "",
            "Token Tracking (estimated):",
            `- budget_tokens: ${tokenHints.budgetTokens}`,
            `- prompt_1_used_tokens: ${tokenHints.stage1PacketTokens}`,
            `- prompt_1_remaining_tokens: ${stage1Remaining}`,
            `- prompt_2_used_tokens: ${tokenHints.stage2PacketTokens}`,
            `- prompt_2_remaining_tokens: ${stage2Remaining}`,
            "- use stage-2 only if model explicitly returns NEED_STAGE2.",
        ]
        : [];
    return [
        "# SMART TWO-STAGE PROMPT WRAPPER",
        "",
        providerGuidance(provider),
        `Task: ${task}`,
        "",
        "Protocol:",
        "1. Read stage-1 packet first.",
        "2. Attempt answer using only stage-1.",
        "3. If insufficient, respond with exactly: NEED_STAGE2: <reason>",
        "4. Only then read stage-2 packet and finalize response.",
        "",
        "Stage-1 Packet:",
        `- ${stage1Path}`,
        "",
        "Stage-2 Packet (on-demand only):",
        `- ${stage2Path}`,
        "",
        "Constraints:",
        "- No full repository scanning",
        "- No speculative assumptions outside packet data",
        "- Keep output compact",
        ...tokenLines,
    ].join("\n");
}
