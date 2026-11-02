import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { Hono } from "hono";
import { ApplicationContext } from "../../core/platform/services/ApplicationContext.ts";
import { EnvService } from "../../core/platform/services/EnvService.ts";
import type { HonoContext } from "../app.ts";
import { getHonoRuntime } from "../runtime.ts";

type McpServerEntry = {
  name: string;
  scope: string;
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
};

type PluginEntry = {
  name: string;
  marketplace?: string;
  enabled: boolean;
  version?: string;
  scope?: string;
};

type SkillEntry = {
  name: string;
  description?: string;
  source: string;
  plugin?: string;
};

type InstalledPluginRecord = {
  key: string;
  name: string;
  marketplace?: string;
  version?: string;
  scope?: string;
  installPath?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.map(String) : undefined;

const normalizeMcpServers = (raw: unknown, scope: string): McpServerEntry[] => {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.entries(raw).map(([name, value]) => {
    const entry = isRecord(value) ? value : {};
    return {
      name,
      scope,
      type: typeof entry.type === "string" ? entry.type : undefined,
      command: typeof entry.command === "string" ? entry.command : undefined,
      args: toStringArray(entry.args),
      url: typeof entry.url === "string" ? entry.url : undefined,
    };
  });
};

const parseEnabledPlugins = (raw: unknown): PluginEntry[] => {
  if (!isRecord(raw)) {
    return [];
  }
  return Object.entries(raw).map(([key, enabled]) => {
    const [name = key, marketplace] = key.split("@");
    return {
      name,
      marketplace,
      enabled: enabled === true,
    };
  });
};

const parseSkillFrontmatter = (content: string): { name?: string; description?: string } => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }
  const frontmatter = match[1] ?? "";
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { name, description };
};

const makeConfigsCollector = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const envService = yield* EnvService;
  const appContext = yield* ApplicationContext;

  const readJsonFile = (filePath: string): Effect.Effect<unknown> =>
    fs.readFileString(filePath).pipe(
      Effect.map((content): unknown => JSON.parse(content)),
      Effect.catchAll(() => Effect.succeed(undefined)),
    );

  const readInstalledPlugins = (home: string) =>
    Effect.gen(function* () {
      const raw = yield* readJsonFile(
        path.resolve(home, ".claude", "plugins", "installed_plugins.json"),
      );
      if (!isRecord(raw) || !isRecord(raw.plugins)) {
        return [] as InstalledPluginRecord[];
      }
      const records: InstalledPluginRecord[] = [];
      for (const [key, installations] of Object.entries(raw.plugins)) {
        if (!Array.isArray(installations)) {
          continue;
        }
        const [name = key, marketplace] = key.split("@");
        for (const installation of installations) {
          if (!isRecord(installation)) {
            continue;
          }
          records.push({
            key,
            name,
            marketplace,
            version: typeof installation.version === "string" ? installation.version : undefined,
            scope: typeof installation.scope === "string" ? installation.scope : undefined,
            installPath:
              typeof installation.installPath === "string" ? installation.installPath : undefined,
          });
        }
      }
      return records;
    });

  const collectMcpServers = (home: string, cwd: string) =>
    Effect.gen(function* () {
      const entries: McpServerEntry[] = [];

      // user scope: ~/.claude.json (top-level mcpServers)
      const claudeJson = yield* readJsonFile(path.resolve(home, ".claude.json"));
      if (isRecord(claudeJson)) {
        entries.push(...normalizeMcpServers(claudeJson.mcpServers, "user"));
        // project scope inside ~/.claude.json: projects.<cwd>.mcpServers
        const projects = claudeJson.projects;
        if (isRecord(projects)) {
          for (const projectConfig of Object.values(projects)) {
            if (isRecord(projectConfig)) {
              entries.push(...normalizeMcpServers(projectConfig.mcpServers, "project"));
            }
          }
        }
      }

      // project scope: <cwd>/.mcp.json
      const dotMcp = yield* readJsonFile(path.resolve(cwd, ".mcp.json"));
      if (isRecord(dotMcp)) {
        entries.push(...normalizeMcpServers(dotMcp.mcpServers, "project (.mcp.json)"));
      }

      // plugin-provided MCP servers (via installed_plugins.json installPath)
      for (const plugin of yield* readInstalledPlugins(home)) {
        if (plugin.installPath === undefined) {
          continue;
        }
        const manifest = yield* readJsonFile(
          path.resolve(plugin.installPath, ".claude-plugin", "plugin.json"),
        );
        if (isRecord(manifest)) {
          entries.push(...normalizeMcpServers(manifest.mcpServers, `plugin (${plugin.name})`));
        }
      }

      return entries;
    });

  const collectPlugins = (home: string) =>
    Effect.gen(function* () {
      const installed = yield* readInstalledPlugins(home);
      const settings = yield* readJsonFile(path.resolve(home, ".claude", "settings.json"));
      const enabled = isRecord(settings) ? parseEnabledPlugins(settings.enabledPlugins) : [];
      const enabledKeys = new Set(enabled.map((p) => `${p.name}@${p.marketplace ?? ""}`));

      const plugins: PluginEntry[] = installed.map((p) => ({
        name: p.name,
        marketplace: p.marketplace,
        enabled: enabledKeys.has(`${p.name}@${p.marketplace ?? ""}`),
        version: p.version,
        scope: p.scope,
      }));

      // enabled in settings but missing from installed_plugins.json
      for (const p of enabled) {
        if (!plugins.some((q) => q.name === p.name && q.marketplace === p.marketplace)) {
          plugins.push({ ...p, enabled: true });
        }
      }

      return plugins;
    });

  const collectSkillsFromDir = (dir: string, source: string, plugin?: string) =>
    Effect.gen(function* () {
      const skills: SkillEntry[] = [];
      const dirExists = yield* fs.exists(dir);
      if (!dirExists) {
        return skills;
      }
      const entries = yield* fs.readDirectory(dir).pipe(Effect.catchAll(() => Effect.succeed([])));
      for (const entry of entries) {
        const skillFile = path.resolve(dir, entry, "SKILL.md");
        if (!(yield* fs.exists(skillFile))) {
          continue;
        }
        const content = yield* fs
          .readFileString(skillFile)
          .pipe(Effect.catchAll(() => Effect.succeed("")));
        const { name, description } = parseSkillFrontmatter(content);
        skills.push({
          name: name ?? entry,
          description,
          source,
          plugin,
        });
      }
      return skills;
    });

  const collectSkills = (home: string, cwd: string) =>
    Effect.gen(function* () {
      const skills: SkillEntry[] = [];

      skills.push(
        ...(yield* collectSkillsFromDir(path.resolve(home, ".claude", "skills"), "user")),
      );
      skills.push(
        ...(yield* collectSkillsFromDir(path.resolve(cwd, ".claude", "skills"), "project")),
      );

      // plugin skills via installed_plugins.json installPath
      for (const plugin of yield* readInstalledPlugins(home)) {
        if (plugin.installPath === undefined) {
          continue;
        }
        skills.push(
          ...(yield* collectSkillsFromDir(
            path.resolve(plugin.installPath, "skills"),
            "plugin",
            plugin.name,
          )),
        );
      }

      return skills;
    });

  const collect = Effect.gen(function* () {
    const home = yield* envService.getEnv("HOME");
    if (home === undefined) {
      return yield* Effect.fail(new Error("HOME environment variable is not set"));
    }
    // ensure ApplicationContext is wired (keeps service dependency explicit)
    yield* appContext.claudeCodePaths;

    const cwd = process.cwd();
    const [mcpServers, plugins, skills] = yield* Effect.all(
      [collectMcpServers(home, cwd), collectPlugins(home), collectSkills(home, cwd)],
      { concurrency: 3 },
    );

    return { mcpServers, plugins, skills };
  });

  return { collect };
});

const configsRoutes = Effect.gen(function* () {
  const runtime = yield* getHonoRuntime;
  const collector = yield* makeConfigsCollector;

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

export { configsRoutes };
