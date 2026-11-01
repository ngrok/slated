import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cx } from "@ngrok/mantle/cx";
import { useContext, useRef } from "react";
import { IssueCard } from "./issue-card";
import { SelectedIssueContext } from "./selected-issue";
import type { CalendarIssue } from "./types";

/**
 * How far the pointer must travel before a press becomes a drag. MonthList's
 * drag sensor uses the same distance, so every press either opens the issue or
 * drags it, never neither: a hand moving a few pixels during a click, as it
 * often does on a trackpad, still counts as a click.
 */
export const DRAG_DISTANCE_PX = 8;

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
				// dnd-kit's listeners swallow the synthetic click, so a press that
				// stayed short of a drag is the click.
				const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
				if (moved < DRAG_DISTANCE_PX) {
					onOpen(issue);
				}
			}}
		>
			<IssueCard issue={issue} />
		</div>
	);
}
