import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DraggableIssueCard } from "./draggable-issue-card";
import type { CalendarIssue } from "./types";

const issue: CalendarIssue = {
	id: "1",
	identifier: "GTM-1",
	title: "ClickToOpen",
	dueDate: "2026-06-23",
	url: "https://linear.app/ngrok/issue/GTM-1",
	priority: 0,
	priorityLabel: "No priority",
	state: { id: "s", name: "S", color: "#fff", type: "started" },
	assignee: null,
	labels: [],
	project: null,
	team: { id: "t", key: "GTM", name: "GTM" },
	parent: null,
};

describe("DraggableIssueCard", () => {
	test("tapping the card body opens the issue", async () => {
		const onOpen = vi.fn();
		render(
			<DndContext>
				<DraggableIssueCard issue={issue} onOpen={onOpen} />
			</DndContext>,
		);
		await userEvent.click(screen.getByText("ClickToOpen"));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	test("a press that wobbles a few pixels still opens the issue; a drag does not", () => {
		const onOpen = vi.fn();
		render(
			<DndContext>
				<DraggableIssueCard issue={issue} onOpen={onOpen} />
			</DndContext>,
		);
		const card = screen.getByText("ClickToOpen");

		// 6px: a trackpad click, not a drag.
		fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
		fireEvent.pointerUp(card, { clientX: 106, clientY: 100 });
		expect(onOpen).toHaveBeenCalledTimes(1);

		// 30px: a drag, which reschedules instead of opening.
		fireEvent.pointerDown(card, { clientX: 100, clientY: 100 });
		fireEvent.pointerUp(card, { clientX: 130, clientY: 100 });
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
