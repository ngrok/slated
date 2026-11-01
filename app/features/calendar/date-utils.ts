import {
	addDays,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameMonth,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import type { CalendarIssue, CalendarProject } from "./types";

// Work calendar: weeks start on Monday.
const WEEK_STARTS_ON = 1 as const;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The first and last day of the 5-or-6-week grid that frames a month. */
export function monthGridRange(month: Date): { gridStart: Date; gridEnd: Date } {
	return {
		gridStart: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
		gridEnd: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
	};
}

/** Every day shown in the month grid, including leading/trailing days. */
export function monthGridDays(month: Date): Date[] {
	const { gridStart, gridEnd } = monthGridRange(month);
	return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

/**
 * The weeks "owned" by a month, so the endless scroll never renders a week
 * twice. A week belongs to the month that contains its Monday: a week
 * straddling two months (e.g. Jun 29–Jul 5) is owned by the earlier month and
 * shows the next month's days as muted trailing cells. Each entry is a full
 * 7-day Mon→Sun array, so every rendered row stays column-aligned.
 */
export function monthOwnedWeeks(month: Date): Date[][] {
	let monday = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
	// The first week's Monday may live in the previous month; that week is owned
	// there, so skip ahead to the first Monday that actually falls in this month.
	if (!isSameMonth(monday, month)) {
		monday = addDays(monday, 7);
	}
	const weeks: Date[][] = [];
	while (isSameMonth(monday, month)) {
		weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
		monday = addDays(monday, 7);
	}
	return weeks;
}

export function toISODate(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

/** Bucket dated records by their "YYYY-MM-DD" date for O(1) day lookups. */
function groupByDate<T>(items: T[], dateOf: (item: T) => string): Map<string, T[]> {
	const byDate = new Map<string, T[]>();
	for (const item of items) {
		const date = dateOf(item);
		const existing = byDate.get(date);
		if (existing) {
			existing.push(item);
		} else {
			byDate.set(date, [item]);
		}
	}
	return byDate;
}

// Linear's priorities are 1 (urgent) to 4 (low), with 0 for none. None sorts
// after low rather than first.
const priorityRank = (issue: CalendarIssue) => issue.priority || Number.POSITIVE_INFINITY;

/**
 * Bucket issues by their dueDate, the day the calendar places them on, most
 * urgent first. A day tile shows only its first few cards, so this decides
 * which stay visible; ties fall back to the identifier so cards don't shuffle
 * between renders.
 */
export function groupIssuesByDueDate(issues: CalendarIssue[]): Map<string, CalendarIssue[]> {
	const byDate = groupByDate(issues, (issue) => issue.dueDate);
	for (const day of byDate.values()) {
		day.sort(
			(a, b) =>
				priorityRank(a) - priorityRank(b) ||
				a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
		);
	}
	return byDate;
}

/** Bucket projects by their targetDate, the day the calendar places them on. */
export function groupProjectsByTargetDate(
	projects: CalendarProject[],
): Map<string, CalendarProject[]> {
	return groupByDate(projects, (project) => project.targetDate);
}
