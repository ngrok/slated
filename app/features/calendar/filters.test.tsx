import { DropdownMenu } from "@ngrok/mantle/dropdown-menu";
import { act, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { FilterMenus, useCalendarFilters } from "./filters";
import type { LabelOption, TeamOption } from "./types";

const teams: TeamOption[] = [
	{ id: "gtm", key: "GTM", name: "GTM" },
	{ id: "content", key: "CON", name: "Content" },
];

const labels: LabelOption[] = [
	{
		name: "web",
		color: "#5e6ad2",
		matchesNamespace: true,
		ids: ["gtm-web", "content-web"],
		idByTeam: {},
		globalIds: [],
	},
	{
		name: "blog",
		color: "#95a2b3",
		matchesNamespace: false,
		ids: ["content-blog"],
		idByTeam: {},
		globalIds: [],
	},
];

describe("useCalendarFilters", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("starts with no labels and no teams when no default is configured", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, []));
		expect(result.current.teamIds).toEqual([]);
		expect(result.current.labelIds).toEqual([]);
	});

	test("seeds the default teams on first visit and drops unknown ids", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, ["content", "old-team"]));
		expect(result.current.teamIds).toEqual(["content"]);
	});

	test("toggleTeam removes then re-adds a team", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, []));
		const first = teams[0]?.id as string;

		act(() => result.current.toggleTeam(first));
		expect(result.current.teamIds).toContain(first);

		act(() => result.current.toggleTeam(first));
		expect(result.current.teamIds).not.toContain(first);
	});

	test("restores selected teams from localStorage and drops unknown ids", () => {
		localStorage.setItem("slated:team-ids:v1", JSON.stringify(["content", "old-team"]));
		const { result } = renderHook(() => useCalendarFilters(teams, ["gtm"]));

		expect(result.current.teamIds).toEqual(["content"]);
	});

	test("reads a selection saved under the old calgrok key", () => {
		// The app shipped as "calgrok" before the rename. Anyone who used it then
		// has their teams under the old key, and losing it would silently reset
		// their calendar to an empty selection.
		localStorage.setItem("calgrok:team-ids:v1", JSON.stringify(["content"]));
		const { result } = renderHook(() => useCalendarFilters(teams, ["gtm"]));

		expect(result.current.teamIds).toEqual(["content"]);
	});

	test("the current key wins over the old calgrok key", () => {
		localStorage.setItem("calgrok:team-ids:v1", JSON.stringify(["gtm"]));
		localStorage.setItem("slated:team-ids:v1", JSON.stringify(["content"]));
		const { result } = renderHook(() => useCalendarFilters(teams, []));

		expect(result.current.teamIds).toEqual(["content"]);
	});

	test("a stored empty selection wins over the configured default", () => {
		localStorage.setItem("slated:team-ids:v1", JSON.stringify([]));
		const { result } = renderHook(() => useCalendarFilters(teams, ["gtm"]));

		expect(result.current.teamIds).toEqual([]);
	});

	test("an untouched first visit stores nothing, so a default can still apply later", () => {
		renderHook(() => useCalendarFilters(teams, []));

		// Storing [] here would outrank LINEAR_TEAM_DEFAULT on every later visit.
		expect(localStorage.getItem("slated:team-ids:v1")).toBeNull();
	});

	test("the seeded default is not written to storage", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, ["content"]));

		expect(result.current.teamIds).toEqual(["content"]);
		expect(localStorage.getItem("slated:team-ids:v1")).toBeNull();
	});

	test("clearing the last team by hand is remembered", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, ["content"]));

		act(() => result.current.toggleTeam("content"));

		expect(result.current.teamIds).toEqual([]);
		expect(localStorage.getItem("slated:team-ids:v1")).toBe("[]");
	});

	test("toggleLabelGroup adds and removes all ids of a name together", () => {
		const { result } = renderHook(() => useCalendarFilters(teams, []));

		act(() => result.current.toggleLabelGroup(["gtm-web", "content-web"]));
		expect(result.current.labelIds).toEqual(["gtm-web", "content-web"]);

		act(() => result.current.toggleLabelGroup(["gtm-web", "content-web"]));
		expect(result.current.labelIds).toEqual([]);
	});
});

describe("FilterMenus", () => {
	test("lists the teams under Options and reflects the selection", async () => {
		const onToggleTeam = vi.fn();
		render(
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>Options</DropdownMenu.Trigger>
				<DropdownMenu.Content>
					<FilterMenus
						teams={teams}
						teamsLoading={false}
						teamIds={["gtm"]}
						labelIds={[]}
						labels={labels}
						onToggleTeam={onToggleTeam}
						onToggleLabelGroup={vi.fn()}
						onClearLabels={vi.fn()}
					/>
				</DropdownMenu.Content>
			</DropdownMenu.Root>,
		);

		await userEvent.click(screen.getByRole("button", { name: "Options" }));
		await userEvent.click(screen.getByRole("menuitem", { name: /Teams/ }));
		expect(screen.getByRole("menuitemcheckbox", { name: /GTM/ })).toBeChecked();
		const content = screen.getByRole("menuitemcheckbox", { name: /Content/ });
		expect(content).not.toBeChecked();

		await userEvent.click(content);
		expect(onToggleTeam).toHaveBeenCalledWith("content");
		// Held open, so another team can be picked straight away.
		expect(screen.getByRole("menuitemcheckbox", { name: /GTM/ })).toBeInTheDocument();
	});
});
