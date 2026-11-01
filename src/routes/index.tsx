import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/gate/desk-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <DeskApp />;
}
