import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { IssueCard } from "./issue-card";
import type { CalendarIssue } from "./types";

const issue: CalendarIssue = {
	id: "1",
	identifier: "GTM-1",
	title: "Launch blog post",
	dueDate: "2026-06-23",
	url: "https://linear.app/ngrok/issue/GTM-1",
	priority: 2,
	priorityLabel: "High",
	state: { id: "s1", name: "In Progress", color: "#f2c94c", type: "started" },
	assignee: { id: "u1", name: "Joel Hans", displayName: "Joel", avatarUrl: null },
	labels: [{ id: "l1", name: "Blog", color: "#5e6ad2" }],
	project: { id: "p1", name: "Q3 Content", url: "https://linear.app/ngrok/project/q3" },
	team: { id: "t1", key: "GTM", name: "GTM" },
	parent: null,
};

describe("IssueCard", () => {
	test("shows the title without links to Linear, so a click opens the panel", () => {
		render(<IssueCard issue={issue} />);
		expect(screen.getByText("Launch blog post")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	test("conveys the workflow state through an accessible status icon", () => {
		render(<IssueCard issue={issue} />);
		// The status is shown as a Linear-style glyph (no text label on the card);
		// its accessible name carries the state name.
		expect(screen.getByRole("img", { name: "In Progress" })).toBeInTheDocument();
	});
});
