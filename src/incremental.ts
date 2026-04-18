import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

interface CacheData {
  hashes: Record<string, string>;
  updatedAt: string;
}

function hashFile(absPath: string): string {
  const content = fs.readFileSync(absPath);
  return createHash("sha1").update(content).digest("hex");
}

function collectRepoFiles(baseDir: string): string[] {
  const out: string[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;

      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }

  return out;
}

function rel(baseDir: string, absPath: string): string {
  return path.relative(baseDir, absPath).replace(/\\/g, "/");
}

export function detectChangedFiles(baseDir: string): string[] {
  const cachePath = path.join(baseDir, ".smart-context-cache.json");
  const currentFiles = collectRepoFiles(baseDir);

  const previous: CacheData = fs.existsSync(cachePath)
    ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
    : { hashes: {}, updatedAt: "" };

  const nextHashes: Record<string, string> = {};
  const changed: string[] = [];

  for (const absPath of currentFiles) {
    const file = rel(baseDir, absPath);
    const hash = hashFile(absPath);
    nextHashes[file] = hash;

    if (previous.hashes[file] !== hash) {
      changed.push(file);
    }
  }

  const cacheData: CacheData = {
    hashes: nextHashes,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), "utf8");

  return changed.sort();
}
