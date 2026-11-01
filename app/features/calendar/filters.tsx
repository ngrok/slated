import { DropdownMenu } from "@ngrok/mantle/dropdown-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { readStored } from "~/lib/storage";
import type { LabelOption, TeamOption } from "./types";

const TEAM_STORAGE_KEY = "slated:team-ids:v1";

export type CalendarFilters = {
	teamIds: string[];
	labelIds: string[];
	toggleTeam: (id: string) => void;
	toggleLabelGroup: (ids: string[]) => void;
	clearLabels: () => void;
	setLabelIds: (ids: string[]) => void;
};

export function useCalendarFilters(teams: TeamOption[], defaultTeamIds: string[]): CalendarFilters {
	const [teamIds, setTeamIds] = useState<string[]>([]);
	const [labelIds, setLabelIdsState] = useState<string[]>([]);
	const loadedStoredTeams = useRef(false);
	// Only a real toggle should be written to storage. Persisting the seeded
	// value would store [] on a first visit that hasn't been interacted with,
	// and a stored [] outranks LINEAR_TEAM_DEFAULT forever after.
	const userChangedTeams = useRef(false);

	useEffect(() => {
		if (loadedStoredTeams.current || teams.length === 0) {
			return;
		}
		const validIds = new Set(teams.map((team) => team.id));
		try {
			const raw = readStored(TEAM_STORAGE_KEY);
			const parsed = raw ? JSON.parse(raw) : null;
			if (Array.isArray(parsed)) {
				// A stored value (even an empty one — the user cleared it) wins.
				setTeamIds(parsed.filter((id): id is string => typeof id === "string" && validIds.has(id)));
			} else {
				// No prior selection: seed from the configured default teams.
				setTeamIds(defaultTeamIds.filter((id) => validIds.has(id)));
			}
		} catch {
			// ignore malformed storage
		}
		loadedStoredTeams.current = true;
	}, [teams, defaultTeamIds]);

	useEffect(() => {
		if (!loadedStoredTeams.current) {
			return;
		}
		const validIds = new Set(teams.map((team) => team.id));
		setTeamIds((prev) => {
			const next = prev.filter((id) => validIds.has(id));
			return next.length === prev.length ? prev : next;
		});
	}, [teams]);

	useEffect(() => {
		if (!loadedStoredTeams.current || !userChangedTeams.current) {
			return;
		}
		try {
			localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teamIds));
		} catch {
			// ignore quota/availability errors
		}
	}, [teamIds]);

	const setLabelIds = useCallback((ids: string[]) => {
		setLabelIdsState([...new Set(ids)]);
	}, []);

	function toggleTeam(id: string) {
		userChangedTeams.current = true;
		setTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
	}
	// A label name can map to several ids across teams; toggle them together.
	function toggleLabelGroup(ids: string[]) {
		setLabelIdsState((prev) => {
			const allPresent = ids.every((id) => prev.includes(id));
			if (allPresent) {
				return prev.filter((id) => !ids.includes(id));
			}
			return [...new Set([...prev, ...ids])];
		});
	}
	function clearLabels() {
		setLabelIdsState([]);
	}

	return { teamIds, labelIds, toggleTeam, toggleLabelGroup, clearLabels, setLabelIds };
}

/**
 * The team and label filters, as two submenus for the Options menu. Toggling
 * holds the menu open so several teams or labels can be picked at once.
 */
export function FilterMenus({
	teams,
	teamsLoading,
	teamIds,
	labelIds,
	labels,
	onToggleTeam,
	onToggleLabelGroup,
	onClearLabels,
}: {
	teams: TeamOption[];
	teamsLoading: boolean;
	teamIds: string[];
	labelIds: string[];
	labels: LabelOption[];
	onToggleTeam: (id: string) => void;
	onToggleLabelGroup: (ids: string[]) => void;
	onClearLabels: () => void;
}) {
	const selectedCount = labels.filter((option) =>
		option.ids.some((id) => labelIds.includes(id)),
	).length;
	const selectedTeamCount = teams.filter((team) => teamIds.includes(team.id)).length;
	const keepOpen = (event: Event) => event.preventDefault();

	return (
		<>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					Teams
					<span className="ml-auto pl-2 text-xs text-muted">
						{selectedTeamCount > 0 ? selectedTeamCount : null}
					</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent className="max-h-80 w-64 overflow-y-auto">
					{teamsLoading ? <DropdownMenu.Label>Loading teams…</DropdownMenu.Label> : null}
					{!teamsLoading && teams.length === 0 ? (
						<DropdownMenu.Label>No teams found.</DropdownMenu.Label>
					) : null}
					{teams.map((team) => (
						<DropdownMenu.CheckboxItem
							key={team.id}
							checked={teamIds.includes(team.id)}
							onSelect={keepOpen}
							onCheckedChange={() => onToggleTeam(team.id)}
						>
							<span className="truncate">{team.name}</span>
							<span className="ml-auto pl-2 text-xs text-muted">{team.key}</span>
						</DropdownMenu.CheckboxItem>
					))}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>

			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger>
					Labels
					<span className="ml-auto pl-2 text-xs text-muted">
						{selectedCount > 0 ? selectedCount : null}
					</span>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent className="max-h-80 w-64 overflow-y-auto">
					{/* Labels are scoped to the selected teams, so an empty list before any
					    team is picked means "not yet", not "none exist". */}
					{teamIds.length === 0 ? (
						<DropdownMenu.Label>Select a team first.</DropdownMenu.Label>
					) : labels.length === 0 ? (
						<DropdownMenu.Label>No labels for the selected teams.</DropdownMenu.Label>
					) : (
						labels.map((option) => (
							<DropdownMenu.CheckboxItem
								key={option.name}
								checked={option.ids.some((id) => labelIds.includes(id))}
								onSelect={keepOpen}
								onCheckedChange={() => onToggleLabelGroup(option.ids)}
							>
								<span
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: option.color }}
								/>
								<span className="truncate">{option.name}</span>
								{option.matchesNamespace ? (
									<span className="ml-auto pl-2 text-xs text-muted">default</span>
								) : null}
							</DropdownMenu.CheckboxItem>
						))
					)}
					{selectedCount > 0 ? (
						<>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								onSelect={(event) => {
									event.preventDefault();
									onClearLabels();
								}}
							>
								Clear labels
							</DropdownMenu.Item>
						</>
					) : null}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</>
	);
}
