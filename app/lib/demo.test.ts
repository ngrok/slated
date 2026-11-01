import { describe, expect, test } from "vitest";
import { demoIssues, demoLabels, demoProjects, demoTeams } from "./demo.server";

const ALL_TEAMS = demoTeams().teams.map((team) => team.id);

// A six-week window, the shape a month grid actually asks for.
const WINDOW = { start: "2026-08-31", end: "2026-10-04" };

function issues(overrides: Partial<Parameters<typeof demoIssues>[0]> = {}) {
	return demoIssues({ ...WINDOW, teamIds: ALL_TEAMS, labelIds: [], ...overrides });
}

describe("demo issues", () => {
	test("fills the window and stays inside it", () => {
		const result = issues();
		expect(result.length).toBeGreaterThan(15);
		for (const issue of result) {
			expect(issue.dueDate >= WINDOW.start).toBe(true);
			expect(issue.dueDate <= WINDOW.end).toBe(true);
		}
	});

	test("is deterministic, so overlapping month grids agree", () => {
		// June's grid runs into July and July's runs back into June. Both windows
		// have to place the shared days identically or cards would jump between
		// months as the user scrolls.
		const june = issues({ start: "2026-06-01", end: "2026-07-05" });
		const july = issues({ start: "2026-06-29", end: "2026-08-09" });
		const overlap = (list: typeof june) =>
			list
				.filter((issue) => issue.dueDate >= "2026-06-29" && issue.dueDate <= "2026-07-05")
				.map((issue) => `${issue.id}@${issue.dueDate}`)
				.sort();
		expect(overlap(june)).toEqual(overlap(july));
		expect(overlap(june).length).toBeGreaterThan(0);
	});

	test("never repeats a title inside a month grid", () => {
		// A month grid spans three calendar months at its edges, so the template
		// pool has to hold three disjoint slices. Check a year of them: one repeat
		// on screen reads as a bug in the calendar, not as a joke told twice.
		for (let month = 0; month < 12; month++) {
			const window = {
				start: `2026-${String(month + 1).padStart(2, "0")}-01`,
				end: `2026-${String(month + 1).padStart(2, "0")}-28`,
			};
			// Widen to the grid the month actually renders: a week either side.
			const grid = issues({
				start: new Date(2026, month, -6).toISOString().slice(0, 10),
				end: new Date(2026, month + 1, 7).toISOString().slice(0, 10),
			});
			const titles = grid.map((issue) => issue.title);
			expect(new Set(titles).size, `duplicate title in the ${window.start} grid`).toBe(
				titles.length,
			);
		}
	});

	test("piles more cards onto some days than a day tile shows", () => {
		// The day tile fits three; the demo needs days past that to show "+N more".
		const perDay = new Map<string, number>();
		for (const issue of issues({ start: "2026-09-01", end: "2026-09-30" })) {
			perDay.set(issue.dueDate, (perDay.get(issue.dueDate) ?? 0) + 1);
		}
		const busy = [...perDay.values()].filter((count) => count >= 5);
		expect(busy.length).toBeGreaterThanOrEqual(2);
	});

	test("filters by team", () => {
		const contentOnly = issues({ teamIds: ["team-con"] });
		expect(contentOnly.length).toBeGreaterThan(0);
		expect(contentOnly.every((issue) => issue.team.key === "CON")).toBe(true);
	});

	test("filters by label", () => {
		const blog = demoLabels().labels.find((label) => label.name === "blog");
		const tagged = issues({ labelIds: blog?.ids ?? [] });
		expect(tagged.length).toBeGreaterThan(0);
		expect(tagged.every((issue) => issue.labels.some((label) => label.name === "blog"))).toBe(true);
	});
});

describe("demo projects", () => {
	test("places projects in the window, one per day", () => {
		const result = demoProjects({ ...WINDOW, teamIds: ALL_TEAMS });
		expect(result.length).toBeGreaterThan(0);
		const dates = result.map((project) => project.targetDate);
		expect(new Set(dates).size).toBe(dates.length);
	});

	test("progress agrees with status", () => {
		const result = demoProjects({ start: "2026-01-01", end: "2026-12-31", teamIds: ALL_TEAMS });
		for (const project of result) {
			if (project.status.type === "completed") {
				expect(project.progress).toBe(1);
			}
			expect(project.progress).toBeLessThanOrEqual(1);
			expect(project.progress).toBeGreaterThanOrEqual(0);
		}
	});
});
