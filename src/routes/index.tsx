import { createFileRoute } from "@tanstack/react-router";
import { SpaceGame } from "@/game/SpaceGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SpaceGame />;
}
