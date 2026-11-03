import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/web/app/memory/page";
import { ProtectedRoute } from "../components/ProtectedRoute";

const RouteComponent = () => {
  return (
    <ProtectedRoute>
      <MemoryPage />
    </ProtectedRoute>
  );
};

export const Route = createFileRoute("/memory")({
  component: RouteComponent,
});
