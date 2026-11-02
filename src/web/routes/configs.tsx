import { createFileRoute } from "@tanstack/react-router";
import { ConfigsPage } from "@/web/app/configs/page";
import { ProtectedRoute } from "../components/ProtectedRoute";

const RouteComponent = () => {
  return (
    <ProtectedRoute>
      <ConfigsPage />
    </ProtectedRoute>
  );
};

export const Route = createFileRoute("/configs")({
  component: RouteComponent,
});
