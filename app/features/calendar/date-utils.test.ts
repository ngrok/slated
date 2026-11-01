import { describe, expect, test } from "vitest";
import { groupIssuesByDueDate, monthGridDays, monthOwnedWeeks, toISODate } from "./date-utils";
import type { CalendarIssue } from "./types";

describe("monthGridDays", () => {
	test("covers the whole month, starts on Monday, and is whole weeks", () => {
		const days = monthGridDays(new Date(2026, 5, 1)); // June 2026
		expect(days.length % 7).toBe(0);
		expect(days[0]?.getDay()).toBe(1); // Monday
		const iso = days.map(toISODate);
		expect(iso).toContain("2026-06-01");
		expect(iso).toContain("2026-06-30");
	});
});

describe("monthOwnedWeeks", () => {
	test("every owned week is a full Mon→Sun run", () => {
		const weeks = monthOwnedWeeks(new Date(2026, 6, 1)); // July 2026
		for (const week of weeks) {
			expect(week).toHaveLength(7);
			expect(week[0]?.getDay()).toBe(1); // Monday
			expect(week[6]?.getDay()).toBe(0); // Sunday
		}
	});

	test("only weeks whose Monday falls in the month are owned", () => {
		// July 2026: the 1st is a Wednesday, so the week of Mon Jun 29 is owned by
		// June, not July. July's first owned week starts Mon Jul 6.
		const july = monthOwnedWeeks(new Date(2026, 6, 1));
		expect(toISODate(july[0]?.[0] as Date)).toBe("2026-07-06");

		const june = monthOwnedWeeks(new Date(2026, 5, 1));
		const lastJuneWeek = june[june.length - 1] as Date[];
		expect(toISODate(lastJuneWeek[0] as Date)).toBe("2026-06-29");
		// That boundary week carries July's leading days as trailing cells.
		expect(lastJuneWeek.map(toISODate)).toContain("2026-07-01");
	});

	test("adjacent months tile with no gap and no duplicated week", () => {
		const june = monthOwnedWeeks(new Date(2026, 5, 1));
		const july = monthOwnedWeeks(new Date(2026, 6, 1));
		const lastJuneMonday = (june[june.length - 1] as Date[])[0] as Date;
		const firstJulyMonday = (july[0] as Date[])[0] as Date;
		// Consecutive Mondays exactly 7 days apart: contiguous, never overlapping.
		expect(toISODate(firstJulyMonday)).toBe("2026-07-06");
		expect((firstJulyMonday.getTime() - lastJuneMonday.getTime()) / 86_400_000).toBe(7);
	});
});

describe("groupIssuesByDueDate", () => {
	const make = (id: string, dueDate: string, priority = 0): CalendarIssue => ({
		id,
		identifier: `GTM-${id}`,
		title: `Issue ${id}`,
		dueDate,
		url: "https://linear.app/x",
		priority,
		priorityLabel: "",
		state: { id: "s", name: "Todo", color: "#fff", type: "unstarted" },
		assignee: null,
		labels: [],
		project: null,
		team: { id: "t", key: "GTM", name: "GTM" },
		parent: null,
	});

	test("buckets issues by their dueDate", () => {
		const grouped = groupIssuesByDueDate([
			make("1", "2026-06-23"),
			make("2", "2026-06-23"),
			make("3", "2026-06-24"),
		]);
		expect(grouped.get("2026-06-23")).toHaveLength(2);
		expect(grouped.get("2026-06-24")).toHaveLength(1);
		expect(grouped.get("2026-06-25")).toBeUndefined();
	});

	test("orders a day most urgent first, with no priority last", () => {
		const day = "2026-06-23";
		const grouped = groupIssuesByDueDate([
			make("12", day, 3),
			make("5", day, 0),
			make("7", day, 4),
			make("9", day, 3),
			make("2", day, 1),
		]);
		// Medium ties go by identifier as a number: GTM-9 before GTM-12.
		expect(grouped.get(day)?.map((issue) => issue.identifier)).toEqual([
			"GTM-2",
			"GTM-9",
			"GTM-12",
			"GTM-7",
			"GTM-5",
		]);
	});
});
