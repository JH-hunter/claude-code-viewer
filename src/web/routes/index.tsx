import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanbanIcon, SettingsIcon } from "lucide-react";
import { ProtectedRoute } from "../components/ProtectedRoute";

const RouteComponent = () => {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 px-4">
          <h1 className="mb-8 text-center text-2xl font-semibold text-foreground">
            claude-code-viewer
          </h1>
          <Link
            to="/projects"
            className="flex items-center gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <FolderKanbanIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold">Projects</div>
              <div className="text-sm text-muted-foreground">Browse projects and sessions</div>
            </div>
          </Link>
          <Link
            to="/configs"
            className="flex items-center gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent"
          >
            <SettingsIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-lg font-semibold">Configs</div>
              <div className="text-sm text-muted-foreground">
                Installed MCP servers, plugins and skills
              </div>
            </div>
          </Link>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export const Route = createFileRoute("/")({
  component: RouteComponent,
});
