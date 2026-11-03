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
  projectPath?: string;
  memories: MemoryFileEntry[];
};

const encodeProjectPath = (projectPath: string): string =>
  projectPath.replace(/[^a-zA-Z0-9]/g, "-");

const makeMemoryCollector = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appContext = yield* ApplicationContext;

  // Primary source of real project paths: ~/.claude.json "projects" keys are
  // the original cwd values; encoding them reproduces the directory name.
  const readEncodedPathMap = (): Effect.Effect<ReadonlyMap<string, string>> =>
    Effect.gen(function* () {
      const home = (yield* appContext.claudeCodePaths).globalClaudeDirectoryPath;
      const raw = yield* fs
        .readFileString(path.resolve(home, "..", ".claude.json"))
        .pipe(Effect.catchAll(() => Effect.succeed(null)));
      const map = new Map<string, string>();
      if (raw === null) {
        return map;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null && "projects" in parsed) {
          const projects = parsed.projects;
          if (typeof projects === "object" && projects !== null) {
            for (const projectPath of Object.keys(projects)) {
              map.set(encodeProjectPath(projectPath), projectPath);
            }
          }
        }
      } catch {
        // fall through with an empty map
      }
      return map;
    });

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

  // The encoded project directory name is lossy (every non-alphanumeric
  // character becomes "-"), so recover the real path from the "cwd" field
  // recorded in one of the project's session transcripts.
  const resolveProjectPath = (
    projectDir: string,
    encodedPathMap: ReadonlyMap<string, string>,
  ): Effect.Effect<string | undefined> =>
    Effect.gen(function* () {
      const fromClaudeJson = encodedPathMap.get(path.basename(projectDir));
      if (fromClaudeJson !== undefined) {
        return fromClaudeJson;
      }
      const entries = yield* fs
        .readDirectory(projectDir)
        .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
      const sessionFile = entries.find((entry) => entry.endsWith(".jsonl"));
      if (sessionFile === undefined) {
        return undefined;
      }

      const chunk = yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(path.resolve(projectDir, sessionFile));
          return yield* file.readAlloc(64 * 1024);
        }),
      ).pipe(Effect.catchAll(() => Effect.succeed(Option.none<Uint8Array>())));

      const bytes = Option.getOrNull(chunk);
      if (bytes === null) {
        return undefined;
      }
      const match = new TextDecoder().decode(bytes).match(/"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match?.[1] === undefined) {
        return undefined;
      }
      try {
        const decoded: unknown = JSON.parse(`"${match[1]}"`);
        return typeof decoded === "string" ? decoded : undefined;
      } catch {
        return undefined;
      }
    });

  const collectProjectMemory = (
    projectDir: string,
    encodedPathMap: ReadonlyMap<string, string>,
  ): Effect.Effect<ProjectMemoryEntry | null> =>
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
        projectPath: yield* resolveProjectPath(projectDir, encodedPathMap),
        memories,
      };
    });

  const collect = Effect.gen(function* () {
    const { claudeProjectsDirPath } = yield* appContext.claudeCodePaths;
    const encodedPathMap = yield* readEncodedPathMap();
    const entries = yield* fs
      .readDirectory(claudeProjectsDirPath)
      .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

    const projects: ProjectMemoryEntry[] = [];
    for (const entry of entries) {
      const projectMemory = yield* collectProjectMemory(
        path.resolve(claudeProjectsDirPath, entry),
        encodedPathMap,
      );
      if (projectMemory !== null) {
        projects.push(projectMemory);
      }
    }

    projects.sort((a, b) =>
      (a.projectPath ?? a.projectDir).localeCompare(b.projectPath ?? b.projectDir),
    );
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
