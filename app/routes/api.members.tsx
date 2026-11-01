import { demoMembers } from "~/lib/demo.server";
import { env } from "~/lib/env.server";
import { linearAuthorization } from "~/lib/linear.server";
import { fetchTeamMembers } from "~/lib/linear-graphql.server";
import type { Route } from "./+types/api.members";

// BFF resource route for the assignee picker: the members of one team, the
// people an issue created in that team can be assigned to.
export async function loader({ request }: Route.LoaderArgs) {
	const teamId = new URL(request.url).searchParams.get("teamId");
	if (!teamId) {
		throw new Response("Missing required 'teamId' query param", { status: 400 });
	}

	if (env.DEMO) {
		return Response.json({ members: demoMembers() });
	}

	const members = await fetchTeamMembers(linearAuthorization, teamId);
	return Response.json({ members });
}
