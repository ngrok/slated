import { memo } from "react";
import { PersonAvatar } from "./person-avatar";
import { PriorityIcon } from "./priority-icon";
import { StatusIcon } from "./status-icon";
import type { CalendarIssue } from "./types";

const MAX_LABEL_DOTS = 3;

// Memoized: issue refs are stable across renders (from the query cache), so
// non-dragging cards skip re-rendering during a drag.
export const IssueCard = memo(function IssueCard({ issue }: { issue: CalendarIssue }) {
	const extraLabels = issue.labels.length - MAX_LABEL_DOTS;

	return (
		<div className="flex flex-col gap-1 rounded-md border border-card bg-card px-2 py-1.5 text-left shadow-sm transition-colors hover:bg-card-hover">
			<div className="flex items-center gap-1.5">
				<StatusIcon type={issue.state.type} color={issue.state.color} label={issue.state.name} />
				<p className="truncate text-sm font-medium leading-snug text-strong" title={issue.title}>
					{issue.title}
				</p>
			</div>

			<div className="flex items-center gap-1.5 pl-5">
				<span className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
					{issue.identifier}
				</span>
				{issue.priority > 0 ? (
					<PriorityIcon
						priority={issue.priority}
						label={issue.priorityLabel}
						className="text-muted"
					/>
				) : null}
				{issue.labels.slice(0, MAX_LABEL_DOTS).map((label) => (
					<span
						key={label.id}
						title={label.name}
						className="size-1.5 shrink-0 rounded-full"
						style={{ backgroundColor: label.color }}
					/>
				))}
				{extraLabels > 0 ? <span className="text-[10px] text-muted">+{extraLabels}</span> : null}

				{/* No links to Linear here: a click anywhere on the card opens the side
				    panel, which links to the issue and its project. */}
				{issue.assignee ? (
					<span className="ml-auto shrink-0">
						<PersonAvatar person={issue.assignee} />
					</span>
				) : null}
			</div>
		</div>
	);
});
