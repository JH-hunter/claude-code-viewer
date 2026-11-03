import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, BrainIcon, FileTextIcon } from "lucide-react";
import { type FC, useState } from "react";
import { MarkdownContent } from "@/web/app/components/MarkdownContent";
import { Badge } from "@/web/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/web/components/ui/card";
import { memoryQuery } from "@/web/lib/api/queries";

export const MemoryPage: FC = () => {
  const { data, isPending, error } = useQuery({
    queryKey: memoryQuery.queryKey,
    queryFn: memoryQuery.queryFn,
  });
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const projects = data?.projects ?? [];
  const activeProject =
    projects.find((project) => project.projectDir === selectedProject) ?? projects[0];

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
        <span className="text-sm font-semibold text-foreground">Memory</span>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <aside className="w-72 flex-shrink-0 overflow-auto border-r border-border/40 p-3 space-y-1">
          {isPending && <div className="p-4 text-sm text-muted-foreground">Loading memory...</div>}

          {error !== null && (
            <div className="p-4 text-sm text-destructive">
              Failed to load memory: {error.message}
            </div>
          )}

          {projects.map((project) => (
            <button
              key={project.projectDir}
              type="button"
              onClick={() => setSelectedProject(project.projectDir)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                activeProject?.projectDir === project.projectDir
                  ? "border-primary bg-accent"
                  : "border-transparent hover:bg-accent"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="break-all text-sm font-medium">{project.projectDir}</span>
                <Badge variant="secondary">{project.memories.length}</Badge>
              </div>
            </button>
          ))}

          {!isPending && error === null && projects.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No memory files found under ~/.claude/projects/*/memory/.
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="container mx-auto max-w-4xl px-6 py-6 space-y-6">
            {activeProject === undefined ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <BrainIcon className="h-10 w-10" />
                  <p>No memory to display</p>
                </div>
              </div>
            ) : (
              activeProject.memories.map((memory) => (
                <Card key={`${activeProject.projectDir}-${memory.name}`}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{memory.name}</CardTitle>
                      {memory.truncated && <Badge variant="outline">truncated</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MarkdownContent content={memory.content} />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
