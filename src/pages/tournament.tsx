import { Link, useParams } from "react-router-dom";
import { TournamentApp } from "@/components/tournament/tournament-app";
import { Button } from "@/components/ui/button";

export function TournamentPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <TournamentApp
      initialState={null}
      cloud={slug ? { slug, revision: 0, updatedAt: "" } : null}
    />
  );
}
