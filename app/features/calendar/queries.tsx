import { makeToast, Toast } from "@ngrok/mantle/toast";
import {
	keepPreviousData,
	type QueryClient,
	useIsFetching,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	CalendarIssue,
	CalendarProject,
	IssuesQueryParams,
	LabelsResponse,
	ProjectsQueryParams,
	TeamMember,
	TeamsResponse,
	WorkflowState,
} from "./types";

/** Cache entries captured before an optimistic write, for rollback. */
type CachedEntries = [readonly unknown[], unknown][];

function rollbackTo(
	queryClient: QueryClient,
	previous: CachedEntries | undefined,
	message: string,
) {
	for (const [key, data] of previous ?? []) {
		queryClient.setQueryData(key, data);
	}
	makeToast(
		<Toast.Root priority="danger">
			<Toast.Message>{message}</Toast.Message>
		</Toast.Root>,
	);
}

const ROOT = "calendar";

export const calendarKeys = {
	root: [ROOT] as const,
	issues: (params: IssuesQueryParams) =>
		[
			ROOT,
			"issues",
			params.start,
			params.end,
			(params.teamIds ?? []).join(","),
			(params.labelIds ?? []).join(","),
		] as const,
	projects: (params: ProjectsQueryParams) =>
		[ROOT, "projects", params.start, params.end, (params.teamIds ?? []).join(",")] as const,
};

// Issues and projects are two query families making up one grid, so anything
// that refreshes or reports on the calendar has to cover both. Otherwise
// projects quietly go stale while the issues around them update.

/** How many grid requests are in flight, for the header's sync indicator. */
export function useCalendarFetchCount(): number {
	const issues = useIsFetching({ queryKey: [ROOT, "issues"] });
	const projects = useIsFetching({ queryKey: [ROOT, "projects"] });
	return issues + projects;
}

/** Refetch everything on the grid: both issues and projects. */
export function invalidateCalendarGrid(queryClient: QueryClient) {
	queryClient.invalidateQueries({ queryKey: [ROOT, "issues"] });
	queryClient.invalidateQueries({ queryKey: [ROOT, "projects"] });
}

async function fetchIssues(params: IssuesQueryParams): Promise<CalendarIssue[]> {
	const search = new URLSearchParams({ start: params.start, end: params.end });
	if (params.teamIds?.length) {
		search.set("teamIds", params.teamIds.join(","));
	}
	if (params.labelIds?.length) {
		search.set("labelIds", params.labelIds.join(","));
	}

	const res = await fetch(`/api/issues?${search.toString()}`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to load issues (${res.status})`);
	}
	const json = (await res.json()) as { issues: CalendarIssue[] };
	return json.issues;
}

export function useCalendarIssues(params: IssuesQueryParams, enabled: boolean) {
	return useQuery({
		queryKey: calendarKeys.issues(params),
		queryFn: () => fetchIssues(params),
		enabled,
		// Keep showing the current month while the next one loads (no empty flash).
		placeholderData: keepPreviousData,
	});
}

async function fetchProjects(params: ProjectsQueryParams): Promise<CalendarProject[]> {
	const search = new URLSearchParams({ start: params.start, end: params.end });
	if (params.teamIds?.length) {
		search.set("teamIds", params.teamIds.join(","));
	}

	const res = await fetch(`/api/projects?${search.toString()}`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to load projects (${res.status})`);
	}
	const json = (await res.json()) as { projects: CalendarProject[] };
	return json.projects;
}

/** Projects placed by target date, in the same window as the month's issues. */
export function useCalendarProjects(params: ProjectsQueryParams, enabled: boolean) {
	return useQuery({
		queryKey: calendarKeys.projects(params),
		queryFn: () => fetchProjects(params),
		enabled,
		placeholderData: keepPreviousData,
	});
}

/** Warm the projects cache for a month the user is likely to reach next. */
export function prefetchCalendarProjects(client: QueryClient, params: ProjectsQueryParams) {
	if ((params.teamIds?.length ?? 0) === 0) {
		return Promise.resolve();
	}
	return client.prefetchQuery({
		queryKey: calendarKeys.projects(params),
		queryFn: () => fetchProjects(params),
	});
}

async function fetchLabelsList(): Promise<LabelsResponse> {
	const res = await fetch("/api/labels", { headers: { Accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`Failed to load labels (${res.status})`);
	}
	return (await res.json()) as LabelsResponse;
}

export function useLabels() {
	return useQuery({
		queryKey: [ROOT, "labels"] as const,
		queryFn: fetchLabelsList,
		staleTime: 5 * 60 * 1000, // labels change rarely
	});
}

async function fetchTeamsList(): Promise<TeamsResponse> {
	const res = await fetch("/api/teams", { headers: { Accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`Failed to load teams (${res.status})`);
	}
	return (await res.json()) as TeamsResponse;
}

export function useTeams() {
	return useQuery({
		queryKey: [ROOT, "teams"] as const,
		queryFn: fetchTeamsList,
		staleTime: 5 * 60 * 1000, // teams change rarely
	});
}

async function fetchWorkflowStates(teamId: string): Promise<WorkflowState[]> {
	const res = await fetch(`/api/states?teamIds=${encodeURIComponent(teamId)}`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to load statuses (${res.status})`);
	}
	const json = (await res.json()) as { states: WorkflowState[] };
	// Order the way Linear's own status menu does.
	return json.states.sort((a, b) => a.position - b.position);
}

/** Workflow states (statuses) available for a team, for the status picker. */
export function useWorkflowStates(teamId: string | null) {
	return useQuery({
		queryKey: [ROOT, "states", teamId] as const,
		queryFn: () => fetchWorkflowStates(teamId as string),
		enabled: Boolean(teamId),
		staleTime: 5 * 60 * 1000, // workflow states change rarely
	});
}

async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
	const res = await fetch(`/api/members?teamId=${encodeURIComponent(teamId)}`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) {
		throw new Error(`Failed to load members (${res.status})`);
	}
	const json = (await res.json()) as { members: TeamMember[] };
	return json.members;
}

/** The members of a team, for the assignee picker. */
export function useTeamMembers(teamId: string | null) {
	return useQuery({
		queryKey: [ROOT, "members", teamId] as const,
		queryFn: () => fetchTeamMembers(teamId as string),
		enabled: Boolean(teamId),
		staleTime: 5 * 60 * 1000, // team membership changes rarely
	});
}

export function useIssueDescription(issueId: string | null) {
	return useQuery({
		queryKey: [ROOT, "issue", issueId] as const,
		queryFn: async () => {
			const res = await fetch(`/api/issue?id=${encodeURIComponent(issueId as string)}`, {
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				throw new Error(`Failed to load issue (${res.status})`);
			}
			return (await res.json()) as { description: string | null };
		},
		enabled: Boolean(issueId),
	});
}

const issuesQueryFilter = { queryKey: [ROOT, "issues"] } as const;
const projectsQueryFilter = { queryKey: [ROOT, "projects"] } as const;

export type NewIssueInput = {
	teamId: string;
	title: string;
	description?: string;
	/** "YYYY-MM-DD". */
	dueDate?: string;
	labelIds?: string[];
	/** Omitted, Linear uses the team's default state. */
	stateId?: string;
	priority?: number;
	/** Omitted, the issue is created unassigned. */
	assigneeId?: string;
};

async function postNewIssue(input: NewIssueInput): Promise<CalendarIssue> {
	const res = await fetch("/api/issue", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw new Error(`Failed to create issue (${res.status})`);
	}
	const json = (await res.json()) as { issue: CalendarIssue };
	return json.issue;
}

/**
 * A cached issues query carries its own window and filters in its key (see
 * calendarKeys.issues), so we can tell whether a new issue is one that query
 * would have returned.
 */
function issueBelongsToQuery(key: readonly unknown[], issue: CalendarIssue): boolean {
	const [, , start, end, teamIds, labelIds] = key as [
		string,
		string,
		string,
		string,
		string,
		string,
	];
	// ISO dates compare correctly as strings.
	if (!issue.dueDate || issue.dueDate < start || issue.dueDate > end) {
		return false;
	}
	if (teamIds && !teamIds.split(",").includes(issue.team.id)) {
		return false;
	}
	if (labelIds) {
		const filtered = new Set(labelIds.split(","));
		return issue.labels.some((label) => filtered.has(label.id));
	}
	return true;
}

/**
 * Create an issue in Linear. The response carries the created issue, so we drop
 * it straight into every cached month that would show it and the card appears
 * without waiting for the refetch that follows.
 */
export function useCreateIssue() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: postNewIssue,
		onSuccess: (issue) => {
			for (const [key, data] of queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter)) {
				if (data && issueBelongsToQuery(key, issue)) {
					queryClient.setQueryData<CalendarIssue[]>(key, [...data, issue]);
				}
			}
			makeToast(
				<Toast.Root priority="success">
					<Toast.Message>Created {issue.identifier}.</Toast.Message>
				</Toast.Root>,
			);
		},
		onError: () => {
			makeToast(
				<Toast.Root priority="danger">
					<Toast.Message>We couldn't create that issue.</Toast.Message>
				</Toast.Root>,
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

async function postDueDate(issueId: string, dueDate: string): Promise<void> {
	const res = await fetch("/api/issues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ issueId, dueDate }),
	});
	if (!res.ok) {
		throw new Error(`Failed to update due date (${res.status})`);
	}
}

/**
 * Reschedule an issue's dueDate with an optimistic cache update: the card jumps
 * to the new day immediately, the mutation fires in the background, and we roll
 * back if Linear rejects it.
 */
export function useUpdateDueDate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ issueId, dueDate }: { issueId: string; dueDate: string }) =>
			postDueDate(issueId, dueDate),
		onMutate: async ({ issueId, dueDate }) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.map((issue) => (issue.id === issueId ? { ...issue, dueDate } : issue)),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

async function postTargetDate(projectId: string, targetDate: string): Promise<void> {
	const res = await fetch("/api/projects", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ projectId, targetDate }),
	});
	if (!res.ok) {
		throw new Error(`Failed to update target date (${res.status})`);
	}
}

/**
 * Reschedule a project's targetDate, the way useUpdateDueDate reschedules an
 * issue: the card jumps to the new day, the mutation follows, and we roll back
 * if Linear rejects it.
 */
export function useUpdateTargetDate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ projectId, targetDate }: { projectId: string; targetDate: string }) =>
			postTargetDate(projectId, targetDate),
		onMutate: async ({ projectId, targetDate }) => {
			await queryClient.cancelQueries(projectsQueryFilter);
			const previous = queryClient.getQueriesData<CalendarProject[]>(projectsQueryFilter);
			queryClient.setQueriesData<CalendarProject[]>(projectsQueryFilter, (old) =>
				old?.map((project) =>
					project.id === projectId
						? // The drop is on one day, so the date is no longer a period.
							{ ...project, targetDate, targetDateResolution: null }
						: project,
				),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(projectsQueryFilter);
		},
	});
}

async function postClearDueDate(issueId: string): Promise<void> {
	const res = await fetch("/api/issues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ issueId, dueDate: null }),
	});
	if (!res.ok) {
		throw new Error(`Failed to clear due date (${res.status})`);
	}
}

/**
 * Clear an issue's dueDate. Optimistically removes it from the calendar (an
 * undated issue has no place on the grid), rolling back on failure.
 */
export function useClearDueDate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (issueId: string) => postClearDueDate(issueId),
		onMutate: async (issueId) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.filter((issue) => issue.id !== issueId),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

async function postLabels(issueId: string, labelIds: string[]): Promise<void> {
	const res = await fetch("/api/issues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ issueId, labelIds }),
	});
	if (!res.ok) {
		throw new Error(`Failed to update labels (${res.status})`);
	}
}

/**
 * Replace an issue's labels with the given full set (caller merges kept
 * non-namespace labels), optimistically updating the cache with rollback.
 */
export function useUpdateLabels() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ issueId, labels }: { issueId: string; labels: CalendarIssue["labels"] }) =>
			postLabels(
				issueId,
				labels.map((label) => label.id),
			),
		onMutate: async ({ issueId, labels }) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.map((issue) => (issue.id === issueId ? { ...issue, labels } : issue)),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

async function postState(issueId: string, stateId: string): Promise<void> {
	const res = await fetch("/api/issues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ issueId, stateId }),
	});
	if (!res.ok) {
		throw new Error(`Failed to update status (${res.status})`);
	}
}

/**
 * Change an issue's status with an optimistic cache update: the badge/border
 * recolor immediately, then we roll back if Linear rejects it. The caller passes
 * the full new state so the cache reflects the right name and color at once.
 */
export function useUpdateState() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ issueId, state }: { issueId: string; state: CalendarIssue["state"] }) =>
			postState(issueId, state.id),
		onMutate: async ({ issueId, state }) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.map((issue) => (issue.id === issueId ? { ...issue, state } : issue)),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

async function postIssueUpdate(body: Record<string, unknown>, what: string): Promise<void> {
	const res = await fetch("/api/issues", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`Failed to update ${what} (${res.status})`);
	}
}

/**
 * Reassign an issue (null unassigns) with an optimistic cache update. The
 * caller passes the whole member so the card's avatar changes at once.
 */
export function useUpdateAssignee() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ issueId, assignee }: { issueId: string; assignee: TeamMember | null }) =>
			postIssueUpdate({ issueId, assigneeId: assignee?.id ?? null }, "assignee"),
		onMutate: async ({ issueId, assignee }) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.map((issue) => (issue.id === issueId ? { ...issue, assignee } : issue)),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

/** Change an issue's priority with an optimistic cache update. */
export function useUpdatePriority() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ issueId, priority }: { issueId: string; priority: number; label: string }) =>
			postIssueUpdate({ issueId, priority }, "priority"),
		onMutate: async ({ issueId, priority, label }) => {
			await queryClient.cancelQueries(issuesQueryFilter);
			const previous = queryClient.getQueriesData<CalendarIssue[]>(issuesQueryFilter);
			queryClient.setQueriesData<CalendarIssue[]>(issuesQueryFilter, (old) =>
				old?.map((issue) =>
					issue.id === issueId ? { ...issue, priority, priorityLabel: label } : issue,
				),
			);
			return { previous };
		},
		onError: (_error, _vars, context) => {
			rollbackTo(
				queryClient,
				context?.previous,
				"We couldn't save that change — it's been reverted.",
			);
		},
		onSettled: () => {
			queryClient.invalidateQueries(issuesQueryFilter);
		},
	});
}

/** Warm the cache for a month the user is likely to navigate to next. */
export function prefetchCalendarIssues(client: QueryClient, params: IssuesQueryParams) {
	if ((params.teamIds?.length ?? 0) === 0) {
		return Promise.resolve();
	}
	return client.prefetchQuery({
		queryKey: calendarKeys.issues(params),
		queryFn: () => fetchIssues(params),
	});
}
