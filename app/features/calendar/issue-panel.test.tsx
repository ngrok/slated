import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { IssuePanel } from "./issue-panel";
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

	render(<IssuePanel issue={issue} onClose={vi.fn()} onStep={vi.fn()} />, {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});

	await userEvent.click(screen.getByRole("button", { name: "Assignee: Ada Lovelace" }));
	await userEvent.click(screen.getByRole("option", { name: /Unassigned/ }));

	const update = () => fetchMock.mock.calls.find(([url]) => url === "/api/issues");
	await waitFor(() => expect(update()).toBeDefined());
	const [, init] = update() ?? [];
	// Dropping the key (undefined) would read as "no change" and fail validation.
	expect(JSON.parse(String(init?.body))).toEqual({ issueId: "issue-1", assigneeId: null });
});
