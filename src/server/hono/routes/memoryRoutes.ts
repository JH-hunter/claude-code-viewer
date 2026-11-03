import { FileSystem, Path } from "@effect/platform";
import { Effect, Option } from "effect";
import { Hono } from "hono";
import { ApplicationContext } from "../../core/platform/services/ApplicationContext.ts";
import type { HonoContext } from "../app.ts";
import { getHonoRuntime } from "../runtime.ts";

const MAX_FILE_BYTES = 256 * 1024;

type MemoryFileEntry = {
  name: string;
  content: string;
  truncated: boolean;
  mtimeMs?: number;
};

type ProjectMemoryEntry = {
  projectDir: string;
  memories: MemoryFileEntry[];
};

const makeMemoryCollector = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appContext = yield* ApplicationContext;

  const readMemoryFile = (filePath: string, name: string): Effect.Effect<MemoryFileEntry | null> =>
    Effect.gen(function* () {
      const stat = yield* fs.stat(filePath).pipe(Effect.catchAll(() => Effect.succeed(null)));
      const raw = yield* fs
        .readFileString(filePath)
        .pipe(Effect.catchAll(() => Effect.succeed(null)));
      if (raw === null) {
        return null;
      }
      const truncated = raw.length > MAX_FILE_BYTES;
      const mtime = stat !== null ? Option.getOrNull(stat.mtime) : null;
      return {
        name,
        content: truncated ? `${raw.slice(0, MAX_FILE_BYTES)}\n\n… (truncated)` : raw,
        truncated,
        mtimeMs: mtime !== null ? mtime.getTime() : undefined,
      };
    });

  const collectProjectMemory = (projectDir: string): Effect.Effect<ProjectMemoryEntry | null> =>
    Effect.gen(function* () {
      const memoryDir = path.resolve(projectDir, "memory");
      if (!(yield* fs.exists(memoryDir).pipe(Effect.catchAll(() => Effect.succeed(false))))) {
        return null;
      }
      const entries = yield* fs
        .readDirectory(memoryDir)
        .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
      const mdFiles = entries
        .filter((entry) => entry.endsWith(".md"))
        .sort((a, b) => {
          // MEMORY.md index first, then alphabetical
          if (a === "MEMORY.md") return -1;
          if (b === "MEMORY.md") return 1;
          return a.localeCompare(b);
        });

      const memories: MemoryFileEntry[] = [];
      for (const name of mdFiles) {
        const memory = yield* readMemoryFile(path.resolve(memoryDir, name), name);
        if (memory !== null) {
          memories.push(memory);
        }
      }

      if (memories.length === 0) {
        return null;
      }
      return {
        projectDir: path.basename(projectDir),
        memories,
      };
    });

  const collect = Effect.gen(function* () {
    const { claudeProjectsDirPath } = yield* appContext.claudeCodePaths;
    const entries = yield* fs
      .readDirectory(claudeProjectsDirPath)
      .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

    const projects: ProjectMemoryEntry[] = [];
    for (const entry of entries) {
      const projectMemory = yield* collectProjectMemory(path.resolve(claudeProjectsDirPath, entry));
      if (projectMemory !== null) {
        projects.push(projectMemory);
      }
    }

    projects.sort((a, b) => a.projectDir.localeCompare(b.projectDir));
    return { projects };
  });

  return { collect };
});

const memoryRoutes = Effect.gen(function* () {
  const runtime = yield* getHonoRuntime;
  const collector = yield* makeMemoryCollector;

  return new Hono<HonoContext>().get("/", async (c) => {
    const result = await Effect.runPromise(
      collector.collect.pipe(
        Effect.map((data) => ({ ok: true as const, data })),
        Effect.catchAll((error: unknown) =>
          Effect.succeed({
            ok: false as const,
            message: error instanceof Error ? error.message : String(error),
          }),
        ),
        Effect.provide(runtime),
      ),
    );

    if (!result.ok) {
      return c.json({ error: result.message }, 500);
    }
    return c.json(result.data);
  });
});

export { memoryRoutes };
