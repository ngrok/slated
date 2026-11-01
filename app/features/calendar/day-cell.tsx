import { useDroppable } from "@dnd-kit/core";
import { cx } from "@ngrok/mantle/cx";
import { Popover } from "@ngrok/mantle/popover";
import { Plus } from "@phosphor-icons/react";
import { format } from "date-fns";
import { forwardRef, memo, useState } from "react";
import { toISODate } from "./date-utils";
import { DraggableIssueCard } from "./draggable-issue-card";
import { DraggableProjectCard } from "./draggable-project-card";
import type { CalendarIssue, CalendarProject } from "./types";

// Every day is the same height, sized for this many cards, so a week reads as a
// grid rather than a skyline and a busy day doesn't stretch its whole row. A day
// with more shows one fewer card and a "+N more" line, which takes less room
// than a card, and the full list opens in a popover. Projects and issues share
// the slots. The height is the header plus SLOTS cards: change them together.
const SLOTS = 3;
const DAY_HEIGHT = "h-[13.25rem]";

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
		const [moreOpen, setMoreOpen] = useState(false);
		function setRefs(node: HTMLDivElement | null) {
			setNodeRef(node);
			if (typeof ref === "function") {
				ref(node);
			} else if (ref) {
				ref.current = node;
			}
		}

		const total = projects.length + issues.length;
		const shown = total <= SLOTS ? total : SLOTS - 1;
		const hidden = total - shown;
		// Projects come first: the bigger unit reads as the day's headline, and it
		// keeps its place when the cap trims the issues under it.
		const visibleProjects = projects.slice(0, shown);
		const visibleIssues = issues.slice(0, Math.max(0, shown - projects.length));

		return (
			<div
				ref={setRefs}
				className={cx(
					"group flex flex-col gap-1.5 overflow-hidden border-b border-l border-card-muted p-1.5 transition-colors",
					DAY_HEIGHT,
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
					{hidden > 0 ? (
						<Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
							<Popover.Trigger asChild>
								<button
									type="button"
									className="rounded px-1 py-0.5 text-left text-xs text-muted hover:bg-card-hover hover:text-strong"
								>
									+{hidden} more
								</button>
							</Popover.Trigger>
							<Popover.Content
								align="start"
								aria-label={format(date, "EEEE, MMMM d")}
								className="z-50 flex max-h-96 w-64 flex-col gap-1.5 overflow-y-auto rounded-md border border-card bg-base p-2 text-strong shadow-lg"
							>
								<p className="px-1 pb-0.5 text-xs font-medium text-muted">
									{format(date, "EEEE, MMM d")}
								</p>
								{projects.map((project) => (
									<DraggableProjectCard key={project.id} project={project} />
								))}
								{issues.map((issue) => (
									<DraggableIssueCard
										key={issue.id}
										issue={issue}
										onOpen={(opened) => {
											setMoreOpen(false);
											onOpenIssue(opened);
										}}
									/>
								))}
							</Popover.Content>
						</Popover.Root>
					) : null}
				</div>
			</div>
		);
	}),
);
