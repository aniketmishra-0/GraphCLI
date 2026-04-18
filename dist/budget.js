"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBudget = resolveBudget;
const PROVIDER_BASE = {
    auto: 1100,
    claude: 1400,
    chatgpt: 1200,
    gpt: 1200,
    codex: 1050,
    copilot: 1000,
    gemini: 1000,
    cursor: 1100,
    windsurf: 1100,
    continue: 1050,
    kiro: 1050,
    deepseek: 1100,
    qwen: 1050,
    mistral: 1000,
    grok: 1100,
    perplexity: 1050,
    other: 1200,
};
const COMPRESSION_FACTOR = {
    ultra: 0.55,
    minimal: 0.75,
    balanced: 1,
};
function resolveBudget(requestedMaxTokens, hardCap, provider, compression) {
    const providerSuggested = Math.floor(PROVIDER_BASE[provider] * COMPRESSION_FACTOR[compression]);
    const maxTokens = Math.max(220, Math.min(requestedMaxTokens, providerSuggested));
    return {
        maxTokens,
        hardCap,
    };
}
