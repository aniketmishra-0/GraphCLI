// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GraphStore } from "../../graphStore";
import { fail, ok, resolveRoot } from "../common";

interface RegistryItem {
  name: string;
  path: string;
  createdAt: string;
}

function registryPath(baseDir: string): string {
  return path.join(baseDir, ".smart-context-registry.json");
}

function readRegistry(baseDir: string): RegistryItem[] {
  const rp = registryPath(baseDir);
  if (!fs.existsSync(rp)) return [];
  return JSON.parse(fs.readFileSync(rp, "utf8")) as RegistryItem[];
}

function writeRegistry(baseDir: string, items: RegistryItem[]): void {
  fs.writeFileSync(registryPath(baseDir), JSON.stringify(items, null, 2), "utf8");
}

export function registerRegistryTools(server: any): void {
  server.tool(
    "register_repo",
    {
      root: z.string().optional(),
      name: z.string(),
      repoPath: z.string(),
    },
    async ({ root, name, repoPath }) => {
      try {
        const baseDir = resolveRoot(root);
        const items = readRegistry(baseDir);
        const normalizedPath = path.resolve(repoPath);

        if (!items.some((x) => x.name === name)) {
          items.push({ name, path: normalizedPath, createdAt: new Date().toISOString() });
        }
        writeRegistry(baseDir, items);
        return ok({ root: baseDir, registered: name, path: normalizedPath, total: items.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "register_repo failed");
      }
    },
  );

  server.tool(
    "list_repos",
    {
      root: z.string().optional(),
    },
    async ({ root }) => {
      try {
        const baseDir = resolveRoot(root);
        const items = readRegistry(baseDir);
        return ok({ root: baseDir, repos: items, count: items.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_repos failed");
      }
    },
  );

  server.tool(
    "unregister_repo",
    {
      root: z.string().optional(),
      name: z.string(),
    },
    async ({ root, name }) => {
      try {
        const baseDir = resolveRoot(root);
        const items = readRegistry(baseDir);
        const next = items.filter((x) => x.name !== name);
        writeRegistry(baseDir, next);
        return ok({ root: baseDir, removed: name, remaining: next.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "unregister_repo failed");
      }
    },
  );

  server.tool(
    "cross_repo_search",
    {
      root: z.string().optional(),
      query: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ root, query, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const items = readRegistry(baseDir);
        const q = query.toLowerCase();
        const results: Array<{ repo: string; file: string; symbol: string; score: number }> = [];

        for (const repo of items) {
          const store = new GraphStore(repo.path);
          const graph = store.readGraphData();

          for (const s of graph.symbols) {
            const score =
              (s.name.toLowerCase().includes(q) ? 2 : 0) +
              (s.signature.toLowerCase().includes(q) ? 1 : 0) +
              (s.file.toLowerCase().includes(q) ? 0.5 : 0);
            if (score > 0) {
              results.push({ repo: repo.name, file: s.file, symbol: s.name, score });
            }
          }
        }

        results.sort((a, b) => b.score - a.score);
        return ok({ root: baseDir, query, results: results.slice(0, limit), total: results.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "cross_repo_search failed");
      }
    },
  );
}
