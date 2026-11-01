import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { IssuePanel, overviewSections } from "./issue-panel";
import type { CalendarIssue, TeamMember } from "./types";

const ada: TeamMember = {
	id: "user-ada",
	name: "Ada Lovelace",
	displayName: "ada",
	avatarUrl: null,
};

const issue: CalendarIssue = {
	id: "issue-1",
	identifier: "CON-7",
	title: "Launch the docs refresh",
	dueDate: "2026-06-15",
	url: "https://linear.app/ngrok/issue/CON-7",
	priority: 0,
	priorityLabel: "No priority",
	state: { id: "todo", name: "Todo", color: "#e2e2e2", type: "unstarted" },
	assignee: ada,
	labels: [],
	project: null,
	team: { id: "con", key: "CON", name: "Content" },
	parent: null,
};

afterEach(() => vi.unstubAllGlobals());

test("unassigning from the panel sends an explicit null assignee", async () => {
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
	const queryClient = new QueryClient();
	queryClient.setQueryData(["calendar", "members", "con"], [ada]);
	queryClient.setQueryData(["calendar", "states", "con"], []);
	queryClient.setQueryData(["calendar", "labels"], { labels: [], requiresLabelMatch: false });
	queryClient.setQueryData(["calendar", "issue", "issue-1"], { description: null });

	render(
		<IssuePanel
			issue={issue}
			newIssue={null}
			overviewIssues={[]}
			onOpenIssue={vi.fn()}
			onClose={vi.fn()}
			onStep={vi.fn()}
			onCreated={vi.fn()}
		/>,
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		},
	);

	await userEvent.click(screen.getByRole("button", { name: "Assignee: Ada Lovelace" }));
	await userEvent.click(screen.getByRole("option", { name: /Unassigned/ }));

	const update = () => fetchMock.mock.calls.find(([url]) => url === "/api/issues");
	await waitFor(() => expect(update()).toBeDefined());
	const [, init] = update() ?? [];
	// Dropping the key (undefined) would read as "no change" and fail validation.
	expect(JSON.parse(String(init?.body))).toEqual({ issueId: "issue-1", assigneeId: null });
});

function renderPanel(target: CalendarIssue, initialDescription: string | null) {
	// A tiny Linear: the detail refetch after a save reads back what was saved.
	let description = initialDescription;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input).startsWith("/api/issue?")) {
			return new Response(JSON.stringify({ description }), { status: 200 });
		}
		const body = JSON.parse(String(init?.body));
		if ("description" in body) {
			description = body.description;
		}
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	});
	vi.stubGlobal("fetch", fetchMock);
	const queryClient = new QueryClient();
	queryClient.setQueryData(["calendar", "members", "con"], [ada]);
	queryClient.setQueryData(["calendar", "states", "con"], []);
	queryClient.setQueryData(["calendar", "team-projects", "con"], [docs]);
	queryClient.setQueryData(["calendar", "labels"], { labels: [], requiresLabelMatch: false });
	queryClient.setQueryData(["calendar", "issue", target.id], { description });
	render(
		<IssuePanel
			issue={target}
			newIssue={null}
			overviewIssues={[]}
			onOpenIssue={vi.fn()}
			onClose={vi.fn()}
			onStep={vi.fn()}
			onCreated={vi.fn()}
		/>,
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		},
	);
	const updates = () =>
		fetchMock.mock.calls
			.filter(([url]) => url === "/api/issues")
			.map(([, init]) => JSON.parse(String(init?.body)));
	return { updates };
}

const docs = { id: "project-docs", name: "Docs Overhaul", url: "https://linear.app/p/docs" };

test("removing the project sends an explicit null project", async () => {
	const { updates } = renderPanel({ ...issue, project: docs }, null);

	await userEvent.click(screen.getByRole("button", { name: "Project: Docs Overhaul" }));
	await userEvent.click(screen.getByRole("option", { name: /No project/ }));

	await waitFor(() => expect(updates()).toEqual([{ issueId: "issue-1", projectId: null }]));
});

test("the description saves on Cmd+Enter and Esc drops the draft", async () => {
	const { updates } = renderPanel(issue, "Old words");

	await userEvent.click(screen.getByRole("button", { name: /Edit description/ }));
	await userEvent.type(screen.getByRole("textbox", { name: "Description" }), " gone{Escape}");
	expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
	expect(screen.getByText("Old words")).toBeTruthy();

	await userEvent.click(screen.getByRole("button", { name: /Edit description/ }));
	const field = screen.getByRole("textbox", { name: "Description" });
	await userEvent.clear(field);
	await userEvent.type(field, "New words{Meta>}{Enter}{/Meta}");

	await waitFor(() =>
		expect(updates()).toEqual([{ issueId: "issue-1", description: "New words" }]),
	);
	expect(screen.getByText("New words")).toBeTruthy();
});

test("the overview lists unfinished work soonest first and this week's unassigned issues", () => {
	const today = new Date(2026, 5, 15);
	const at = (id: string, dueDate: string, extra: Partial<CalendarIssue> = {}): CalendarIssue => ({
		...issue,
		id,
		identifier: id,
		dueDate,
		...extra,
	});
	const done = { ...issue.state, type: "completed" };
	const canceled = { ...issue.state, type: "canceled" };
	const issues = [
		at("later", "2026-06-30"),
		at("week-late", "2026-06-08"),
		at("too-late", "2026-06-07"),
		at("done", "2026-06-15", { state: done }),
		at("canceled", "2026-06-16", { state: canceled, assignee: null }),
		at("today", "2026-06-15"),
		at("free-yesterday", "2026-06-14", { assignee: null }),
		at("free-day-7", "2026-06-22", { assignee: null }),
		at("free-day-8", "2026-06-23", { assignee: null }),
	];

	const { dueNext, unassigned } = overviewSections(issues, today);

	// A week back is still "due next"; eight days back has scrolled out of scope.
	// Finished and canceled work never shows, and the list stops at five.
	expect(dueNext.map((i) => i.id)).toEqual([
		"week-late",
		"free-yesterday",
		"today",
		"free-day-7",
		"free-day-8",
	]);
	// Only today through day 7: yesterday's is late, not upcoming.
	expect(unassigned.map((i) => i.id)).toEqual(["free-day-7"]);
});
