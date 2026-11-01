import { DndContext } from "@dnd-kit/core";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DayCell } from "./day-cell";
import { ProjectCard } from "./project-card";
import type { CalendarIssue, CalendarProject } from "./types";

const project: CalendarProject = {
	id: "p1",
	name: "Q3 Content push",
	url: "https://linear.app/ngrok/project/q3",
	targetDate: "2026-06-23",
	targetDateResolution: null,
	color: "#5e6ad2",
	progress: 0.5,
	status: { id: "ps1", name: "In Progress", color: "#f2c94c", type: "started" },
	lead: { id: "u1", name: "Joel Hans", displayName: "Joel", avatarUrl: null },
	labels: [{ id: "pl1", name: "Content", color: "#5e6ad2" }],
	teams: [{ id: "t1", key: "CON", name: "Content" }],
};

const issue: CalendarIssue = {
	id: "i1",
	identifier: "CON-1",
	title: "Launch blog post",
	dueDate: "2026-06-23",
	url: "https://linear.app/ngrok/issue/CON-1",
	priority: 0,
	priorityLabel: "No priority",
	state: { id: "s1", name: "Todo", color: "#e2e2e2", type: "unstarted" },
	assignee: null,
	labels: [],
	project: null,
	team: { id: "t1", key: "CON", name: "Content" },
	parent: null,
};

describe("ProjectCard", () => {
	test("shows the name, the team, the progress, and a link to the project", () => {
		render(<ProjectCard project={project} />);
		expect(screen.getByText("Q3 Content push")).toBeInTheDocument();
		expect(screen.getByText("CON")).toBeInTheDocument();
		expect(screen.getByText("50%")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /open project/i })).toHaveAttribute(
			"href",
			project.url,
		);
	});

	test("conveys the project status through an accessible status icon", () => {
		render(<ProjectCard project={project} />);
		expect(screen.getByRole("img", { name: "In Progress" })).toBeInTheDocument();
	});

	// A project card and an issue card sit in the same cell, so what marks one as
	// a project cannot be colour alone.
	test("names itself a project", () => {
		render(<ProjectCard project={project} />);
		expect(screen.getByRole("img", { name: "Project" })).toBeInTheDocument();
	});

	test("counts the other teams a project spans", () => {
		render(
			<ProjectCard
				project={{
					...project,
					teams: [
						{ id: "t1", key: "CON", name: "Content" },
						{ id: "t2", key: "GTM", name: "GTM" },
					],
				}}
			/>,
		);
		expect(screen.getByText("CON +1")).toBeInTheDocument();
	});

	// A project whose target is a period sits on the day Linear stores, which
	// nobody picked. Say so rather than implying that day was chosen.
	test("marks a target date that Linear tracks as a period, not a day", () => {
		render(<ProjectCard project={{ ...project, targetDateResolution: "quarter" }} />);
		expect(screen.getByText("approx.")).toBeInTheDocument();
	});

	test("says nothing about an exact target date", () => {
		render(<ProjectCard project={project} />);
		expect(screen.queryByText("approx.")).not.toBeInTheDocument();
	});
});

describe("DayCell with projects", () => {
	function renderDay(projects: CalendarProject[], issues: CalendarIssue[]) {
		render(
			<DndContext>
				<DayCell
					date={new Date(2026, 5, 23)}
					issues={issues}
					projects={projects}
					isCurrentMonth
					isToday={false}
					onOpenIssue={vi.fn()}
					onNewIssue={vi.fn()}
				/>
			</DndContext>,
		);
	}

	test("puts the project above the issues on the same day", () => {
		renderDay([project], [issue]);
		const cards = screen.getAllByText(/Q3 Content push|Launch blog post/);
		expect(cards.map((card) => card.textContent)).toEqual(["Q3 Content push", "Launch blog post"]);
	});

	test("projects and issues share the per-day cap", async () => {
		const issues = Array.from({ length: 6 }, (_, i) => ({
			...issue,
			id: `i${i}`,
			title: `Issue ${i}`,
		}));
		renderDay([project], issues);

		// Seven items don't fit three slots: the project and one issue show, and the
		// other five collapse into "+5 more", which lists the whole day.
		expect(screen.getByText("Q3 Content push")).toBeInTheDocument();
		expect(screen.getByText("Issue 0")).toBeInTheDocument();
		expect(screen.queryByText("Issue 1")).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "+5 more" }));
		const day = screen.getByRole("dialog", { name: "Tuesday, June 23" });
		expect(within(day).getByText("Issue 5")).toBeInTheDocument();
		expect(within(day).getByText("Q3 Content push")).toBeInTheDocument();
	});

	test("a day that fits shows every card and no more button", () => {
		const issues = [0, 1].map((i) => ({ ...issue, id: `i${i}`, title: `Issue ${i}` }));
		renderDay([project], issues);

		expect(screen.getByText("Issue 1")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /more/ })).not.toBeInTheDocument();
	});
});
