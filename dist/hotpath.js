"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeHotPath = computeHotPath;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
function computeHotPath(baseDir, topN) {
    try {
        const raw = (0, node_child_process_1.execSync)("git log --date=unix --pretty=format:'__COMMIT__ %cd' --name-only --since='180 days ago'", {
            cwd: baseDir,
            stdio: ["ignore", "pipe", "ignore"],
        }).toString("utf8");
        const churnCounter = new Map();
        const weightedCounter = new Map();
        const nowSec = Math.floor(Date.now() / 1000);
        let commitTs = nowSec;
        for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            if (trimmed.startsWith("__COMMIT__")) {
                const parts = trimmed.split(" ");
                const ts = Number.parseInt(parts[1] ?? "0", 10);
                if (!Number.isNaN(ts) && ts > 0) {
                    commitTs = ts;
                }
                continue;
            }
            const file = trimmed.replace(/\\/g, "/");
            churnCounter.set(file, (churnCounter.get(file) ?? 0) + 1);
            const ageDays = Math.max(0, (nowSec - commitTs) / 86400);
            const halfLifeDays = 60;
            const weight = Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
            weightedCounter.set(file, (weightedCounter.get(file) ?? 0) + weight);
        }
        return [...churnCounter.entries()]
            .map(([file, churn]) => ({
            file: node_path_1.default.normalize(file).replace(/\\/g, "/"),
            churn,
            weightedChurn: weightedCounter.get(file) ?? 0,
        }))
            .sort((a, b) => b.weightedChurn - a.weightedChurn)
            .slice(0, topN);
    }
    catch {
        return [];
    }
}
