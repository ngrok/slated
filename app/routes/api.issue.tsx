import { demoCreateIssue, demoIssueDetail } from "~/lib/demo.server";
import { env } from "~/lib/env.server";
import { linearAuthorization } from "~/lib/linear.server";
import {
	createIssue,
	fetchIssueDetail,
	MAX_PRIORITY,
	type NewIssueInput,
} from "~/lib/linear-graphql.server";
import type { Route } from "./+types/api.issue";

// BFF resource route for on-demand issue detail (the heavy `description` field
// the calendar list query doesn't load).
export async function loader({ request }: Route.LoaderArgs) {
	const id = new URL(request.url).searchParams.get("id");
	if (!id) {
		throw new Response("Missing 'id' query param", { status: 400 });
	}

	if (env.DEMO) {
		return Response.json(demoIssueDetail(id));
	}

	return Response.json(await fetchIssueDetail(linearAuthorization, id));
}

// Create an issue: POST { teamId, title, description?, dueDate?, labelIds?,
// stateId?, priority?, assigneeId? } -> Linear issueCreate. Responds with the
// new issue in calendar shape so the client can place the card immediately.
export async function action({ request }: Route.ActionArgs) {
	const body = (await request.json()) as Partial<NewIssueInput>;
	const title = body.title?.trim();
	if (!body.teamId) {
		throw new Response("Missing 'teamId'", { status: 400 });
	}
	if (!title) {
		throw new Response("Missing 'title'", { status: 400 });
	}
	if (
		body.priority !== undefined &&
		(!Number.isInteger(body.priority) || body.priority < 0 || body.priority > MAX_PRIORITY)
	) {
		throw new Response("Invalid 'priority'", { status: 400 });
	}

	const description = body.description?.trim();
	if (env.DEMO) {
		return Response.json({
			issue: demoCreateIssue({
				teamId: body.teamId,
				title,
				...(body.dueDate ? { dueDate: body.dueDate } : {}),
				...(body.labelIds?.length ? { labelIds: body.labelIds } : {}),
				...(body.stateId ? { stateId: body.stateId } : {}),
				...(body.priority !== undefined ? { priority: body.priority } : {}),
				...(body.assigneeId ? { assigneeId: body.assigneeId } : {}),
			}),
		});
	}

	const issue = await createIssue({
		authorization: linearAuthorization,
		input: {
			teamId: body.teamId,
			title,
			...(description ? { description } : {}),
			...(body.dueDate ? { dueDate: body.dueDate } : {}),
			...(body.labelIds?.length ? { labelIds: body.labelIds } : {}),
			...(body.stateId ? { stateId: body.stateId } : {}),
			...(body.priority !== undefined ? { priority: body.priority } : {}),
			...(body.assigneeId ? { assigneeId: body.assigneeId } : {}),
		},
	});

	return Response.json({ issue });
}
