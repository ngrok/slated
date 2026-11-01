import type {
	CalendarIssue,
	CalendarProject,
	TeamMember,
	WorkflowState,
} from "~/features/calendar/types";

export type RawLabel = { id: string; name: string; color: string; teamId: string | null };
export type RawTeam = { id: string; key: string; name: string };

const GRAPHQL_URL = "https://api.linear.app/graphql";

type GraphQLResponse<T> = { data?: T; errors?: { message: string }[] };

async function linearGraphQL<T>(
	authorization: string,
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const res = await fetch(GRAPHQL_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: authorization,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (res.status === 401) {
		// There is no sign-in to retry, so a rejected key is a configuration
		// problem: say which variable to look at.
		throw new Response("Linear rejected LINEAR_API_KEY. Check the key and restart the server.", {
			status: 401,
		});
	}
	if (!res.ok) {
		throw new Error(`Linear API error: ${res.status} ${await res.text()}`);
	}

	const json = (await res.json()) as GraphQLResponse<T>;
	if (json.errors?.length) {
		throw new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
	}
	if (!json.data) {
		throw new Error("Linear GraphQL returned no data");
	}
	return json.data;
}

// Every field the calendar renders, shared by the list query and issueCreate so
// a freshly created issue arrives in the same shape as a fetched one.
const CALENDAR_ISSUE_FIELDS = `
  id
  identifier
  title
  dueDate
  url
  priority
  priorityLabel
  state { id name color type }
  assignee { id name displayName avatarUrl }
  labels { nodes { id name color } }
  project { id name url }
  team { id key name }
  parent { id }`;

// One query pulls every field the calendar renders, including nested
// assignee/state/labels/project — avoiding the per-issue N+1 fetches that make
// the @linear/sdk lazy accessors (and tools like LinCal) slow.
const CALENDAR_ISSUES_QUERY = `
query CalendarIssues($filter: IssueFilter!, $first: Int!, $after: String) {
  issues(filter: $filter, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {${CALENDAR_ISSUE_FIELDS}
    }
  }
}`;

type RawIssue = Omit<CalendarIssue, "labels"> & {
	labels: { nodes: CalendarIssue["labels"] };
};

type CalendarIssuesData = {
	issues: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: RawIssue[];
	};
};

export type RawSession = {
	viewer: { name: string; email: string };
	organization: { name: string; urlKey: string };
};

// Viewer and organization in one request. The header needs both on every load,
// and the SDK's `client.viewer` / `client.organization` would cost two.
const SESSION_QUERY = `
query Session {
  viewer { name email }
  organization { name urlKey }
}`;

export async function fetchSession(authorization: string): Promise<RawSession> {
	return linearGraphQL<RawSession>(authorization, SESSION_QUERY, {});
}

export async function fetchCalendarIssues(params: {
	authorization: string;
	teamIds: string[];
	labelIds?: string[];
	start: string;
	end: string;
}): Promise<CalendarIssue[]> {
	// Scope the query to the selected teams AND the visible date window so we
	// never pull the whole backlog.
	const filter: Record<string, unknown> = {
		dueDate: { gte: params.start, lte: params.end },
		team: { id: { in: params.teamIds } },
	};
	if (params.labelIds && params.labelIds.length > 0) {
		filter.labels = { some: { id: { in: params.labelIds } } };
	}

	const issues: CalendarIssue[] = [];
	let after: string | null = null;

	// Paginate to exhaustion. A month of content issues is small; the cap is a
	// runaway guard.
	for (let page = 0; page < 20; page++) {
		const result: CalendarIssuesData = await linearGraphQL<CalendarIssuesData>(
			params.authorization,
			CALENDAR_ISSUES_QUERY,
			{ filter, first: 250, after },
		);
		for (const node of result.issues.nodes) {
			issues.push({ ...node, labels: node.labels.nodes });
		}
		if (!result.issues.pageInfo.hasNextPage) {
			break;
		}
		after = result.issues.pageInfo.endCursor;
	}

	return issues;
}

/**
 * Page sizes for the project query, set by Linear's rate limits rather than by
 * what we would otherwise pick. Nothing here costs money: "complexity" is a
 * number Linear derives from the shape of a query and meters per hour, and
 * overspending it returns errors, not an invoice.
 *
 * Projects are expensive in a way issues are not. Linear scores a query by the
 * page sizes it asks for, not by the rows it returns, and a project's nested
 * `labels` and `teams` connections multiply against the outer page. Measured
 * against Linear (each figure is the drop in the
 * `x-ratelimit-complexity-remaining` header):
 *
 *   250 projects / 50 nested   34,600   refused: the per-query cap is 10,000
 *   100 projects / 20 nested    6,041   allowed, and 7x more than we need
 *    25 projects / 10 nested      861   what we send
 *   250 issues                      13   the issue query, for scale
 *
 * The hourly allowance is 3,000,000 complexity and 2,500 requests. At 6,041 a
 * project request, complexity ran out first (about 496 month-fetches an hour),
 * which the calendar can reach: it refetches every mounted month on window
 * focus. At 861 the request count binds first, so the calendar cannot exhaust
 * its complexity allowance before it exhausts its requests.
 *
 * Because the fetch below paginates, a small page spends roughly per project
 * fetched rather than per project asked for, so a page of 25 is cheaper for
 * every workspace and no less correct: a month holding more projects than that
 * pages through them. Nested connections cap at 10, so a card's "+N" counts
 * stop being exact for a project carrying more than 10 labels or teams.
 *
 * Raising either number raises the score of every request. Measure if you do.
 */
const PROJECTS_PAGE_SIZE = 25;
const PROJECT_NESTED_PAGE_SIZE = 10;

// Every field a project card renders. Projects sit on the calendar by their
// target date, so the query mirrors the issue one: one request, nested
// status/lead/labels/teams, no per-project follow-ups.
const CALENDAR_PROJECTS_QUERY = `
query CalendarProjects($filter: ProjectFilter!, $first: Int!, $after: String) {
  projects(filter: $filter, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      url
      targetDate
      targetDateResolution
      color
      progress
      status { id name color type }
      lead { id name displayName avatarUrl }
      labels(first: ${PROJECT_NESTED_PAGE_SIZE}) { nodes { id name color } }
      teams(first: ${PROJECT_NESTED_PAGE_SIZE}) { nodes { id key name } }
    }
  }
}`;

type RawProject = Omit<CalendarProject, "labels" | "teams"> & {
	labels: { nodes: CalendarProject["labels"] };
	teams: { nodes: CalendarProject["teams"] };
};

type CalendarProjectsData = {
	projects: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: RawProject[];
	};
};

export async function fetchCalendarProjects(params: {
	authorization: string;
	teamIds: string[];
	/** Project label names from LINEAR_PROJECT_LABEL. Empty means no label scope. */
	labelNames?: string[];
	start: string;
	end: string;
}): Promise<CalendarProject[]> {
	// Same shape as the issue filter: the selected teams AND the visible window.
	// `accessibleTeams` is Linear's team filter for projects, which belong to one
	// or more teams rather than exactly one.
	const filter: Record<string, unknown> = {
		targetDate: { gte: params.start, lte: params.end },
		accessibleTeams: { id: { in: params.teamIds } },
	};
	if (params.labelNames && params.labelNames.length > 0) {
		// Project labels are workspace-level, so they are matched by name rather
		// than by the per-team ids the issue filter uses. `or` covers a single
		// configured name as well as several.
		filter.labels = {
			some: { or: params.labelNames.map((name) => ({ name: { eqIgnoreCase: name } })) },
		};
	}

	const projects: CalendarProject[] = [];
	let after: string | null = null;

	// Paginate to exhaustion, with the same runaway guard as the issue query.
	for (let page = 0; page < 20; page++) {
		const result: CalendarProjectsData = await linearGraphQL<CalendarProjectsData>(
			params.authorization,
			CALENDAR_PROJECTS_QUERY,
			{ filter, first: PROJECTS_PAGE_SIZE, after },
		);
		for (const node of result.projects.nodes) {
			projects.push({ ...node, labels: node.labels.nodes, teams: node.teams.nodes });
		}
		if (!result.projects.pageInfo.hasNextPage) {
			break;
		}
		after = result.projects.pageInfo.endCursor;
	}

	return projects;
}

const UPDATE_PROJECT_TARGET_DATE_MUTATION = `
mutation UpdateProjectTargetDate($id: String!, $targetDate: TimelessDate) {
  projectUpdate(id: $id, input: { targetDate: $targetDate, targetDateResolution: null }) {
    success
  }
}`;

/**
 * Move a project's target date.
 *
 * `targetDateResolution` is cleared along with it: a project whose target was a
 * period ("Q4") has been dropped on one day, and leaving the coarse resolution
 * in place would let Linear round the date back off the day the user picked.
 */
export async function updateProjectTargetDate(params: {
	authorization: string;
	projectId: string;
	/** A "YYYY-MM-DD" date, or null to clear it (removes the project from the calendar). */
	targetDate: string | null;
}): Promise<void> {
	const data = await linearGraphQL<{ projectUpdate: { success: boolean } }>(
		params.authorization,
		UPDATE_PROJECT_TARGET_DATE_MUTATION,
		{ id: params.projectId, targetDate: params.targetDate },
	);
	if (!data.projectUpdate.success) {
		throw new Error("Linear did not accept the target date update");
	}
}

const LABELS_QUERY = `
query IssueLabels($first: Int!, $after: String) {
  issueLabels(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name color isGroup team { id } }
  }
}`;

type LabelsData = {
	issueLabels: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: {
			id: string;
			name: string;
			color: string;
			isGroup: boolean;
			team: { id: string } | null;
		}[];
	};
};

/**
 * All non-group labels with their owning team. Labels with the same name can
 * exist in multiple teams; the route groups them for display while keeping each
 * team's id.
 */
export async function fetchLabels(authorization: string): Promise<RawLabel[]> {
	const labels: RawLabel[] = [];
	let after: string | null = null;

	for (let page = 0; page < 20; page++) {
		const result: LabelsData = await linearGraphQL<LabelsData>(authorization, LABELS_QUERY, {
			first: 250,
			after,
		});
		for (const node of result.issueLabels.nodes) {
			if (!node.isGroup) {
				labels.push({
					id: node.id,
					name: node.name,
					color: node.color,
					teamId: node.team?.id ?? null,
				});
			}
		}
		if (!result.issueLabels.pageInfo.hasNextPage) {
			break;
		}
		after = result.issueLabels.pageInfo.endCursor;
	}

	return labels;
}

const TEAMS_QUERY = `
query Teams($first: Int!, $after: String) {
  teams(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id key name }
  }
}`;

type TeamsData = {
	teams: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: RawTeam[];
	};
};

// Every team the user can see in the workspace, not just ones they belong to —
// so someone can monitor a team's calendar without joining it. Linear scopes
// this to teams the viewer has access to (private teams they're not on are
// excluded by the API).
export async function fetchTeams(authorization: string): Promise<RawTeam[]> {
	const teams: RawTeam[] = [];
	let after: string | null = null;

	for (let page = 0; page < 20; page++) {
		const result: TeamsData = await linearGraphQL<TeamsData>(authorization, TEAMS_QUERY, {
			first: 250,
			after,
		});
		teams.push(...result.teams.nodes);
		if (!result.teams.pageInfo.hasNextPage) {
			break;
		}
		after = result.teams.pageInfo.endCursor;
	}

	return teams.sort((a, b) => a.name.localeCompare(b.name));
}

const WORKFLOW_STATES_QUERY = `
query WorkflowStates($teamIds: [ID!]!, $first: Int!, $after: String) {
  workflowStates(filter: { team: { id: { in: $teamIds } } }, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name color type position team { id } }
  }
}`;

type WorkflowStatesData = {
	workflowStates: {
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: (WorkflowState & { team: { id: string } })[];
	};
};

/** Workflow states (statuses) for the given teams, each carrying its team id. */
export async function fetchWorkflowStates(
	authorization: string,
	teamIds: string[],
): Promise<(WorkflowState & { teamId: string })[]> {
	const states: (WorkflowState & { teamId: string })[] = [];
	let after: string | null = null;

	for (let page = 0; page < 20; page++) {
		const result: WorkflowStatesData = await linearGraphQL<WorkflowStatesData>(
			authorization,
			WORKFLOW_STATES_QUERY,
			{ teamIds, first: 250, after },
		);
		for (const node of result.workflowStates.nodes) {
			const { team, ...state } = node;
			states.push({ ...state, teamId: team.id });
		}
		if (!result.workflowStates.pageInfo.hasNextPage) {
			break;
		}
		after = result.workflowStates.pageInfo.endCursor;
	}

	return states;
}

const TEAM_MEMBERS_QUERY = `
query TeamMembers($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    members(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name displayName avatarUrl }
    }
  }
}`;

type TeamMembersData = {
	team: {
		members: {
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
			nodes: TeamMember[];
		};
	};
};

/**
 * The people an issue in this team can be assigned to. Linear leaves
 * deactivated users out of `members` by default.
 */
export async function fetchTeamMembers(
	authorization: string,
	teamId: string,
): Promise<TeamMember[]> {
	const members: TeamMember[] = [];
	let after: string | null = null;

	for (let page = 0; page < 20; page++) {
		const result: TeamMembersData = await linearGraphQL<TeamMembersData>(
			authorization,
			TEAM_MEMBERS_QUERY,
			{ teamId, first: 250, after },
		);
		members.push(...result.team.members.nodes);
		if (!result.team.members.pageInfo.hasNextPage) {
			break;
		}
		after = result.team.members.pageInfo.endCursor;
	}

	return members.sort((a, b) => a.name.localeCompare(b.name));
}

const TEAM_PROJECTS_QUERY = `
query TeamProjects($teamId: String!, $first: Int!, $after: String) {
  team(id: $teamId) {
    projects(
      first: $first
      after: $after
      filter: { status: { type: { nin: ["completed", "canceled"] } } }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { id name url }
    }
  }
}`;

type TeamProject = NonNullable<CalendarIssue["project"]>;

type TeamProjectsData = {
	team: {
		projects: {
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
			nodes: TeamProject[];
		};
	};
};

/**
 * The projects an issue in this team can move into. Finished and canceled
 * projects are left out, the way Linear's own project menu leads with open
 * ones. The nodes carry no nested connections, so a page of 100 stays cheap
 * (see the project page-size note above).
 */
export async function fetchTeamProjects(
	authorization: string,
	teamId: string,
): Promise<TeamProject[]> {
	const projects: TeamProject[] = [];
	let after: string | null = null;

	for (let page = 0; page < 10; page++) {
		const result: TeamProjectsData = await linearGraphQL<TeamProjectsData>(
			authorization,
			TEAM_PROJECTS_QUERY,
			{ teamId, first: 100, after },
		);
		projects.push(...result.team.projects.nodes);
		if (!result.team.projects.pageInfo.hasNextPage) {
			break;
		}
		after = result.team.projects.pageInfo.endCursor;
	}

	return projects.sort((a, b) => a.name.localeCompare(b.name));
}

const CREATE_ISSUE_MUTATION = `
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {${CALENDAR_ISSUE_FIELDS}
    }
  }
}`;

export type NewIssueInput = {
	teamId: string;
	title: string;
	description?: string;
	/** "YYYY-MM-DD". Omitted, the issue is created without a place on the calendar. */
	dueDate?: string;
	labelIds?: string[];
	/** Omitted, Linear uses the team's default state. */
	stateId?: string;
	priority?: number;
	/** Omitted, the issue is created unassigned. */
	assigneeId?: string;
};

/**
 * Create an issue and return it in calendar shape, so the caller can put the
 * card on the grid without a second round trip.
 */
export async function createIssue(params: {
	authorization: string;
	input: NewIssueInput;
}): Promise<CalendarIssue> {
	const data = await linearGraphQL<{
		issueCreate: { success: boolean; issue: RawIssue | null };
	}>(params.authorization, CREATE_ISSUE_MUTATION, { input: params.input });

	if (!data.issueCreate.success || !data.issueCreate.issue) {
		throw new Error("Linear did not accept the new issue");
	}
	const issue = data.issueCreate.issue;
	return { ...issue, labels: issue.labels.nodes };
}

// Linear's priority scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low.
export const MAX_PRIORITY = 4;

const UPDATE_ISSUE_MUTATION = `
mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
  }
}`;

/**
 * Set any of an issue's assignee, priority, project, and description in one
 * write. A null assignee or project removes it.
 */
export async function updateIssue(params: {
	authorization: string;
	issueId: string;
	input: {
		assigneeId?: string | null;
		priority?: number;
		projectId?: string | null;
		/** Markdown; an empty string clears it. */
		description?: string;
	};
}): Promise<void> {
	const data = await linearGraphQL<{ issueUpdate: { success: boolean } }>(
		params.authorization,
		UPDATE_ISSUE_MUTATION,
		{ id: params.issueId, input: params.input },
	);
	if (!data.issueUpdate.success) {
		throw new Error("Linear did not accept the issue update");
	}
}

const UPDATE_STATE_MUTATION = `
mutation UpdateState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
  }
}`;

export async function updateIssueState(params: {
	authorization: string;
	issueId: string;
	stateId: string;
}): Promise<void> {
	const data = await linearGraphQL<{ issueUpdate: { success: boolean } }>(
		params.authorization,
		UPDATE_STATE_MUTATION,
		{ id: params.issueId, stateId: params.stateId },
	);
	if (!data.issueUpdate.success) {
		throw new Error("Linear did not accept the status update");
	}
}

const UPDATE_DUE_DATE_MUTATION = `
mutation UpdateDueDate($id: String!, $dueDate: TimelessDate) {
  issueUpdate(id: $id, input: { dueDate: $dueDate }) {
    success
  }
}`;

export async function updateIssueDueDate(params: {
	authorization: string;
	issueId: string;
	/** A "YYYY-MM-DD" date, or null to clear it (removes the issue from the calendar). */
	dueDate: string | null;
}): Promise<void> {
	const data = await linearGraphQL<{ issueUpdate: { success: boolean } }>(
		params.authorization,
		UPDATE_DUE_DATE_MUTATION,
		{ id: params.issueId, dueDate: params.dueDate },
	);
	if (!data.issueUpdate.success) {
		throw new Error("Linear did not accept the due date update");
	}
}

const UPDATE_LABELS_MUTATION = `
mutation UpdateLabels($id: String!, $labelIds: [String!]) {
  issueUpdate(id: $id, input: { labelIds: $labelIds }) {
    success
  }
}`;

// Note: issueUpdate replaces the entire label set. Callers must pass the full
// desired list (the modal merges kept non-namespace labels with edited ones).
export async function updateIssueLabels(params: {
	authorization: string;
	issueId: string;
	labelIds: string[];
}): Promise<void> {
	const data = await linearGraphQL<{ issueUpdate: { success: boolean } }>(
		params.authorization,
		UPDATE_LABELS_MUTATION,
		{ id: params.issueId, labelIds: params.labelIds },
	);
	if (!data.issueUpdate.success) {
		throw new Error("Linear did not accept the label update");
	}
}

const ISSUE_DETAIL_QUERY = `
query IssueDetail($id: String!) {
  issue(id: $id) {
    id
    description
  }
}`;

export async function fetchIssueDetail(
	authorization: string,
	issueId: string,
): Promise<{ description: string | null }> {
	const data = await linearGraphQL<{ issue: { id: string; description: string | null } }>(
		authorization,
		ISSUE_DETAIL_QUERY,
		{ id: issueId },
	);
	return { description: data.issue.description };
}
