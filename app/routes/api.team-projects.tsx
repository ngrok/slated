import { demoTeamProjects } from "~/lib/demo.server";
import { env } from "~/lib/env.server";
import { linearAuthorization } from "~/lib/linear.server";
import { fetchTeamProjects } from "~/lib/linear-graphql.server";
import type { Route } from "./+types/api.team-projects";

// BFF resource route for the panel's project picker: the open projects of one
// team, the ones an issue in that team can move into. Unlike /api/projects it
// is not scoped to a calendar window or LINEAR_PROJECT_LABEL.
export async function loader({ request }: Route.LoaderArgs) {
	const teamId = new URL(request.url).searchParams.get("teamId");
	if (!teamId) {
		throw new Response("Missing required 'teamId' query param", { status: 400 });
	}

	if (env.DEMO) {
		return Response.json({ projects: demoTeamProjects(teamId) });
	}

	const projects = await fetchTeamProjects(linearAuthorization, teamId);
	return Response.json({ projects });
}
