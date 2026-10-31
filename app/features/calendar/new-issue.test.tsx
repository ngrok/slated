import { DndContext } from "@dnd-kit/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DayCell } from "./day-cell";
import { NewIssueDialog } from "./new-issue-dialog";
import { calendarKeys, useCreateIssue } from "./queries";
import type { CalendarIssue, LabelOption, TeamMember, TeamOption, WorkflowState } from "./types";

const teams: TeamOption[] = [{ id: "gtm", key: "GTM", name: "GTM" }];

const labels: LabelOption[] = [
	{
		name: "web",
		color: "#5e6ad2",
		matchesNamespace: true,
		ids: ["gtm-web", "content-web"],
		idByTeam: { gtm: "gtm-web", content: "content-web" },
		globalIds: [],
	},
];

const states: WorkflowState[] = [
	{ id: "todo", name: "Todo", color: "#e2e2e2", type: "unstarted", position: 0 },
];

const members: TeamMember[] = [
	{ id: "user-ada", name: "Ada Lovelace", displayName: "ada", avatarUrl: null },
	{ id: "user-grace", name: "Grace Hopper", displayName: "grace", avatarUrl: null },
];

const created: CalendarIssue = {
	id: "issue-new",
	identifier: "GTM-42",
	title: "Launch the docs refresh",
	dueDate: "2026-06-15",
	url: "https://linear.app/ngrok/issue/GTM-42",
	priority: 0,
	priorityLabel: "No priority",
	state: { id: "todo", name: "Todo", color: "#e2e2e2", type: "unstarted" },
	assignee: null,
	labels: [{ id: "gtm-web", name: "web", color: "#5e6ad2" }],
	project: null,
	team: { id: "gtm", key: "GTM", name: "GTM" },
	parent: null,
};

function seededClient(): QueryClient {
	const queryClient = new QueryClient();
	queryClient.setQueryData(["calendar", "teams"], { teams, defaultTeamIds: [] });
	queryClient.setQueryData(["calendar", "labels"], { labels, requiresLabelMatch: true });
	queryClient.setQueryData(["calendar", "states", "gtm"], states);
	queryClient.setQueryData(["calendar", "members", "gtm"], members);
	return queryClient;
}

function wrapperFor(queryClient: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

function mockCreateResponse() {
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(JSON.stringify({ issue: created }), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("useCreateIssue", () => {
	test("POSTs the new issue and drops it into the months that would show it", async () => {
		const fetchMock = mockCreateResponse();
		const queryClient = new QueryClient();
		const covering = { start: "2026-06-01", end: "2026-07-05", teamIds: ["gtm"], labelIds: [] };
		const otherMonth = { start: "2026-07-06", end: "2026-08-02", teamIds: ["gtm"], labelIds: [] };
		queryClient.setQueryData(calendarKeys.issues(covering), []);
		queryClient.setQueryData(calendarKeys.issues(otherMonth), []);

		const { result } = renderHook(() => useCreateIssue(), { wrapper: wrapperFor(queryClient) });
		await act(async () => {
			await result.current.mutateAsync({
				teamId: "gtm",
				title: "Launch the docs refresh",
				dueDate: "2026-06-15",
			});
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/issue",
			expect.objectContaining({ method: "POST" }),
		);
		expect(queryClient.getQueryData<CalendarIssue[]>(calendarKeys.issues(covering))).toEqual([
			created,
		]);
		expect(queryClient.getQueryData<CalendarIssue[]>(calendarKeys.issues(otherMonth))).toEqual([]);
	});

	test("skips a month whose label filter the new issue doesn't match", async () => {
		mockCreateResponse();
		const queryClient = new QueryClient();
		const params = {
			start: "2026-06-01",
			end: "2026-07-05",
			teamIds: ["gtm"],
			labelIds: ["gtm-video"],
		};
		queryClient.setQueryData(calendarKeys.issues(params), []);

		const { result } = renderHook(() => useCreateIssue(), { wrapper: wrapperFor(queryClient) });
		await act(async () => {
			await result.current.mutateAsync({
				teamId: "gtm",
				title: "Launch the docs refresh",
				dueDate: "2026-06-15",
			});
		});

		expect(queryClient.getQueryData<CalendarIssue[]>(calendarKeys.issues(params))).toEqual([]);
	});
});

describe("NewIssueDialog", () => {
	test("creates an issue on the given date with the tags and assignee the user picks", async () => {
		const fetchMock = mockCreateResponse();
		const onClose = vi.fn();
		const queryClient = seededClient();

		render(<NewIssueDialog date="2026-06-15" onClose={onClose} defaultTeamId="gtm" />, {
			wrapper: wrapperFor(queryClient),
		});

		expect(screen.getByRole("button", { name: /Jun 15, 2026/ })).toBeInTheDocument();
		// Tags start empty; the team's own label id goes out once one is picked.
		expect(screen.getByRole("checkbox", { name: /web/ })).not.toBeChecked();

		await userEvent.type(screen.getByLabelText("Title"), "Launch the docs refresh");
		await userEvent.click(screen.getByRole("checkbox", { name: /web/ }));
		// Unassigned until someone is picked; the picked member's id goes out.
		await userEvent.click(screen.getByRole("button", { name: "Assignee" }));
		await userEvent.click(screen.getByRole("button", { name: /grace/ }));
		expect(screen.getByRole("button", { name: "Assignee" })).toHaveTextContent("grace");
		await userEvent.click(screen.getByRole("button", { name: "Create issue" }));

		const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({
			teamId: "gtm",
			title: "Launch the docs refresh",
			dueDate: "2026-06-15",
			labelIds: ["gtm-web"],
			assigneeId: "user-grace",
		});
		expect(onClose).toHaveBeenCalled();
	});

	test("won't submit without a title", async () => {
		const fetchMock = mockCreateResponse();
		render(<NewIssueDialog date="2026-06-15" onClose={vi.fn()} defaultTeamId="gtm" />, {
			wrapper: wrapperFor(seededClient()),
		});

		await userEvent.click(screen.getByRole("button", { name: "Create issue" }));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("DayCell", () => {
	test("the day's + button opens a new issue on that day", async () => {
		const onNewIssue = vi.fn();
		render(
			<DndContext>
				<DayCell
					date={new Date(2026, 5, 15)}
					issues={[]}
					projects={[]}
					isCurrentMonth
					isToday={false}
					onOpenIssue={vi.fn()}
					onNewIssue={onNewIssue}
				/>
			</DndContext>,
		);

		await userEvent.click(screen.getByRole("button", { name: /New issue on June 15, 2026/ }));
		expect(onNewIssue).toHaveBeenCalledWith("2026-06-15");
	});
});
