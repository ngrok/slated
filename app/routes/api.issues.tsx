import { demoIssues, demoUpdateIssue } from "~/lib/demo.server";
import { env } from "~/lib/env.server";
import { linearAuthorization } from "~/lib/linear.server";
import {
	fetchCalendarIssues,
	MAX_PRIORITY,
	updateIssueAssigneeAndPriority,
	updateIssueDueDate,
	updateIssueLabels,
	updateIssueState,
} from "~/lib/linear-graphql.server";
import type { Route } from "./+types/api.issues";

// BFF resource route: the browser fetches issues from here (same-origin) and the
// server talks to Linear with the configured API key. The key never reaches the
// browser.
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const start = url.searchParams.get("start");
	const end = url.searchParams.get("end");
	if (!start || !end) {
		throw new Response("Missing required 'start' and 'end' query params", { status: 400 });
	}

	const teamIdsParam = url.searchParams.get("teamIds");
	const teamIds = teamIdsParam ? teamIdsParam.split(",").filter(Boolean) : [];
	if (teamIds.length === 0) {
		throw new Response("Missing required 'teamIds' query param", { status: 400 });
	}

	const labelIdsParam = url.searchParams.get("labelIds");
	const labelIds = labelIdsParam ? labelIdsParam.split(",").filter(Boolean) : [];

	if (env.DEMO) {
		return Response.json({ issues: demoIssues({ start, end, teamIds, labelIds }) });
	}

	const issues = await fetchCalendarIssues({
		authorization: linearAuthorization,
		teamIds,
		labelIds,
		start,
		end,
	});

	return Response.json({ issues });
}

// Update an issue: POST { issueId, dueDate?, labelIds?, stateId?, assigneeId?,
// priority? } -> Linear issueUpdate.
export async function action({ request }: Route.ActionArgs) {
	const body = (await request.json()) as {
		issueId?: string;
		dueDate?: string | null;
		labelIds?: string[];
		stateId?: string;
		assigneeId?: string | null;
		priority?: number;
	};
	if (!body.issueId) {
		throw new Response("Missing 'issueId'", { status: 400 });
	}

	// dueDate present (string to set, null to clear) vs. absent.
	const hasDueDate = "dueDate" in body;
	const hasLabels = Array.isArray(body.labelIds);
	const hasState = typeof body.stateId === "string";
	// assigneeId present (string to assign, null to unassign) vs. absent.
	const hasAssignee = "assigneeId" in body;
	const hasPriority = "priority" in body;
	if (!hasDueDate && !hasLabels && !hasState && !hasAssignee && !hasPriority) {
		throw new Response(
			"Provide 'dueDate', 'labelIds', 'stateId', 'assigneeId', and/or 'priority'",
			{
				status: 400,
			},
		);
	}
	if (
		hasPriority &&
		(!Number.isInteger(body.priority) ||
			(body.priority as number) < 0 ||
			(body.priority as number) > MAX_PRIORITY)
	) {
		throw new Response("Invalid 'priority'", { status: 400 });
	}

	if (env.DEMO) {
		demoUpdateIssue({
			issueId: body.issueId,
			...(hasDueDate ? { dueDate: body.dueDate ?? null } : {}),
			...(hasLabels ? { labelIds: body.labelIds } : {}),
			...(hasState ? { stateId: body.stateId } : {}),
			...(hasAssignee ? { assigneeId: body.assigneeId ?? null } : {}),
			...(hasPriority ? { priority: body.priority } : {}),
		});
		return Response.json({ ok: true });
	}

	if (hasDueDate) {
		await updateIssueDueDate({
			authorization: linearAuthorization,
			issueId: body.issueId,
			dueDate: body.dueDate ?? null,
		});
	}
	if (hasLabels) {
		await updateIssueLabels({
			authorization: linearAuthorization,
			issueId: body.issueId,
			labelIds: body.labelIds as string[],
		});
	}
	if (hasState) {
		await updateIssueState({
			authorization: linearAuthorization,
			issueId: body.issueId,
			stateId: body.stateId as string,
		});
	}
	if (hasAssignee || hasPriority) {
		await updateIssueAssigneeAndPriority({
			authorization: linearAuthorization,
			issueId: body.issueId,
			input: {
				...(hasAssignee ? { assigneeId: body.assigneeId ?? null } : {}),
				...(hasPriority ? { priority: body.priority } : {}),
			},
		});
	}

	return Response.json({ ok: true });
}
