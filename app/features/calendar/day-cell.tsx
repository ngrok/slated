import { useDroppable } from "@dnd-kit/core";
import { cx } from "@ngrok/mantle/cx";
import { Plus } from "@phosphor-icons/react";
import { format } from "date-fns";
import { forwardRef, memo, useState } from "react";
import { toISODate } from "./date-utils";
import { DraggableIssueCard } from "./draggable-issue-card";
import { DraggableProjectCard } from "./draggable-project-card";
import type { CalendarIssue, CalendarProject } from "./types";

// Cap visible cards per day so a busy day doesn't blow up the row height.
// Projects and issues share the budget, so the cap holds however the day is
// made up.
const MAX_VISIBLE = 4;

export const DayCell = memo(
	forwardRef<
		HTMLDivElement,
		{
			date: Date;
			issues: CalendarIssue[];
			projects: CalendarProject[];
			isCurrentMonth: boolean;
			isToday: boolean;
			onOpenIssue: (issue: CalendarIssue) => void;
			onNewIssue: (dueDate: string) => void;
		}
	>(function DayCell(
		{ date, issues, projects, isCurrentMonth, isToday, onOpenIssue, onNewIssue },
		ref,
	) {
		// Each day is a drop target keyed by its ISO date (the new dueDate).
		const { setNodeRef, isOver } = useDroppable({ id: toISODate(date) });
		const [expanded, setExpanded] = useState(false);
		function setRefs(node: HTMLDivElement | null) {
			setNodeRef(node);
			if (typeof ref === "function") {
				ref(node);
			} else if (ref) {
				ref.current = node;
			}
		}

		const hidden = projects.length + issues.length - MAX_VISIBLE;
		// Projects come first: the bigger unit reads as the day's headline, and it
		// keeps its place when the cap trims the issues under it.
		const visibleProjects = expanded ? projects : projects.slice(0, MAX_VISIBLE);
		const visibleIssues = expanded
			? issues
			: issues.slice(0, Math.max(0, MAX_VISIBLE - projects.length));

		return (
			<div
				ref={setRefs}
				className={cx(
					"group flex min-h-28 flex-col gap-1.5 border-b border-l border-card-muted p-1.5 transition-colors",
					!isCurrentMonth && "bg-card-hover/40",
					isToday && "bg-filled-accent/5",
					isOver && "bg-filled-accent/10 ring-1 ring-inset ring-accent-500",
				)}
			>
				<div className="flex items-center justify-between">
					{/* Quiet until the day is hovered or the button is focused, so the
					    grid stays clean but a new issue is always one click away. */}
					<button
						type="button"
						aria-label={`New issue on ${format(date, "MMMM d, yyyy")}`}
						className="rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-card-hover hover:text-strong focus-visible:opacity-100 group-hover:opacity-100"
						onClick={() => onNewIssue(toISODate(date))}
					>
						<Plus className="size-3.5" weight="bold" />
					</button>
					<span
						className={cx(
							"flex size-5 items-center justify-center rounded-full text-sm",
							isToday && "bg-filled-accent font-medium text-white",
							!isToday && !isCurrentMonth && "text-muted",
							!isToday && isCurrentMonth && "text-strong",
						)}
					>
						{date.getDate()}
					</span>
				</div>

				<div className="flex flex-col gap-1.5">
					{visibleProjects.map((project) => (
						<DraggableProjectCard key={project.id} project={project} />
					))}
					{visibleIssues.map((issue) => (
						<DraggableIssueCard key={issue.id} issue={issue} onOpen={onOpenIssue} />
					))}
					{!expanded && hidden > 0 ? (
						<button
							type="button"
							className="rounded px-1 py-0.5 text-left text-xs text-muted hover:text-strong"
							onClick={() => setExpanded(true)}
						>
							+{hidden} more
						</button>
					) : null}
				</div>
			</div>
		);
	}),
);
