import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, PackageIcon, PlugIcon, SparklesIcon } from "lucide-react";
import type { FC } from "react";
import { Badge } from "@/web/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/web/components/ui/card";
import { configsQuery } from "@/web/lib/api/queries";

const scopeBadgeVariant = (scope: string) => {
  if (scope.startsWith("user")) {
    return "default" as const;
  }
  if (scope.startsWith("project")) {
    return "secondary" as const;
  }
  return "outline" as const;
};

export const ConfigsPage: FC = () => {
  const { data, isPending, error } = useQuery({
    queryKey: configsQuery.queryKey,
    queryFn: configsQuery.queryFn,
  });

  return (
    <div className="flex flex-col h-dvh max-h-dvh overflow-hidden">
      <header className="h-(--spacing-header-height) flex items-center gap-2 px-3 bg-muted/30 border-b border-border/40 text-xs flex-shrink-0 select-none">
        <Link
          to="/"
          className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <span className="text-sm font-semibold text-foreground">Configs</span>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8 space-y-8">
          {isPending && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading configs...
            </div>
          )}

          {error !== null && (
            <div className="flex items-center justify-center py-12 text-destructive">
              Failed to load configs: {error.message}
            </div>
          )}

          {data !== undefined && (
            <>
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <PlugIcon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">MCP Servers</h2>
                  <Badge variant="secondary">{data.mcpServers.length}</Badge>
                </div>
                {data.mcpServers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No MCP servers found.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.mcpServers.map((server) => (
                      <Card key={`${server.scope}-${server.name}`}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">{server.name}</CardTitle>
                            <Badge variant={scopeBadgeVariant(server.scope)}>{server.scope}</Badge>
                          </div>
                          {server.type !== undefined && (
                            <CardDescription>type: {server.type}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="text-sm">
                          {server.command !== undefined && (
                            <code className="block break-all rounded bg-muted px-2 py-1">
                              {server.command}
                              {server.args !== undefined && server.args.length > 0
                                ? ` ${server.args.join(" ")}`
                                : ""}
                            </code>
                          )}
                          {server.url !== undefined && (
                            <code className="block break-all rounded bg-muted px-2 py-1">
                              {server.url}
                            </code>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-center gap-2">
                  <PackageIcon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Plugins</h2>
                  <Badge variant="secondary">{data.plugins.length}</Badge>
                </div>
                {data.plugins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No plugins found.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.plugins.map((plugin) => (
                      <Card key={`${plugin.marketplace ?? ""}-${plugin.name}`}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">{plugin.name}</CardTitle>
                            <Badge variant={plugin.enabled ? "default" : "outline"}>
                              {plugin.enabled ? "enabled" : "disabled"}
                            </Badge>
                          </div>
                          <CardDescription>
                            {[
                              plugin.marketplace !== undefined
                                ? `marketplace: ${plugin.marketplace}`
                                : undefined,
                              plugin.version !== undefined
                                ? `version: ${plugin.version}`
                                : undefined,
                              plugin.scope !== undefined ? `scope: ${plugin.scope}` : undefined,
                            ]
                              .filter((part) => part !== undefined)
                              .join(" · ")}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-xl font-semibold">Skills</h2>
                  <Badge variant="secondary">{data.skills.length}</Badge>
                </div>
                {data.skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skills found.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.skills.map((skill) => (
                      <Card key={`${skill.source}-${skill.plugin ?? ""}-${skill.name}`}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base">{skill.name}</CardTitle>
                            <Badge variant={skill.source === "user" ? "default" : "secondary"}>
                              {skill.source}
                              {skill.plugin !== undefined ? ` (${skill.plugin})` : ""}
                            </Badge>
                          </div>
                          {skill.description !== undefined && (
                            <CardDescription>{skill.description}</CardDescription>
                          )}
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
