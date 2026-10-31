import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cx } from "@ngrok/mantle/cx";
import { useContext, useRef } from "react";
import { IssueCard } from "./issue-card";
import { SelectedIssueContext } from "./selected-issue";
import type { CalendarIssue } from "./types";

// dnd-kit's listeners swallow the synthetic `click`, so we detect a tap from the
// pointer events it uses: if the pointer barely moved between down and up, treat
// it as a click and open the side panel. A real drag moves further and is ignored.
const TAP_THRESHOLD_PX = 5;

export function DraggableIssueCard({
	issue,
	onOpen,
}: {
	issue: CalendarIssue;
	onOpen: (issue: CalendarIssue) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: issue.id,
		data: { issue },
	});
	const pointerStart = useRef<{ x: number; y: number } | null>(null);
	const isSelected = useContext(SelectedIssueContext) === issue.id;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dnd-kit's attributes give it role="button" and tabIndex.
		<div
			ref={setNodeRef}
			// The side panel steps through cards in document order (see MonthList).
			data-issue-id={issue.id}
			aria-current={isSelected ? "true" : undefined}
			style={{ transform: CSS.Translate.toString(transform) }}
			className={cx(
				"cursor-pointer touch-none rounded-md",
				isDragging && "opacity-40",
				isSelected && "ring-2 ring-accent-600",
			)}
			{...attributes}
			{...listeners}
			onKeyDown={(event) => {
				// dnd-kit makes the card a focusable button; let the keyboard open it too.
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen(issue);
				}
			}}
			onPointerDown={(event) => {
				pointerStart.current = { x: event.clientX, y: event.clientY };
				listeners?.onPointerDown?.(event);
			}}
			onPointerUp={(event) => {
				const start = pointerStart.current;
				pointerStart.current = null;
				if (!start) {
					return;
				}
				// Let clicks on the issue/project links do their own thing.
				if ((event.target as HTMLElement).closest("a")) {
					return;
				}
				const movedX = Math.abs(event.clientX - start.x);
				const movedY = Math.abs(event.clientY - start.y);
				if (movedX < TAP_THRESHOLD_PX && movedY < TAP_THRESHOLD_PX) {
					onOpen(issue);
				}
			}}
		>
			<IssueCard issue={issue} />
		</div>
	);
}
