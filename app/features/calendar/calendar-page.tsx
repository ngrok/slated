import { Button, IconButton } from "@ngrok/mantle/button";
import { Plus } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import { toISODate } from "./date-utils";
import { FilterMenus, useCalendarFilters } from "./filters";
import { MonthList, type MonthListHandle } from "./month-list";
import { OptionsMenu } from "./options-menu";
import { useLabels, useTeams } from "./queries";
import { useViewOptions } from "./view-options";

export function CalendarPage({
	projectLabel,
}: {
	/** Project label names from LINEAR_PROJECT_LABEL, shown beside the toggle. */
	projectLabel: string[];
}) {
	const teamsQuery = useTeams();
	const teams = teamsQuery.data?.teams ?? [];
	const defaultTeamIds = teamsQuery.data?.defaultTeamIds ?? [];
	const filters = useCalendarFilters(teams, defaultTeamIds);
	const { labelIds, setLabelIds } = filters;
	const { options, toggle } = useViewOptions();
	const listRef = useRef<MonthListHandle>(null);
	const labelsQuery = useLabels();
	const labelConfig = labelsQuery.data;
	const labels = labelConfig?.labels ?? [];
	const requiresLabelMatch = labelConfig?.requiresLabelMatch ?? true;
	const visibleLabels = useMemo(
		() =>
			filters.teamIds.length === 0
				? []
				: labels.filter(
						(option) =>
							option.globalIds.length > 0 ||
							filters.teamIds.some((teamId) => option.idByTeam[teamId]),
					),
		[filters.teamIds, labels],
	);
	const visibleSelectedLabelIds = useMemo(() => {
		if (filters.labelIds.length === 0) {
			return [];
		}
		const visibleIds = new Set(visibleLabels.flatMap((option) => option.ids));
		return filters.labelIds.filter((id) => visibleIds.has(id));
	}, [filters.labelIds, visibleLabels]);
	const defaultLabelIds = useMemo(
		() => visibleLabels.filter((option) => option.matchesNamespace).flatMap((option) => option.ids),
		[visibleLabels],
	);
	const lastAppliedDefaultLabels = useRef<string | null>(null);
	useEffect(() => {
		if (!requiresLabelMatch || !labelsQuery.isSuccess) {
			return;
		}

		const defaultSignature = defaultLabelIds.join(",");
		const visibleIds = new Set(visibleLabels.flatMap((option) => option.ids));
		const prunedLabelIds = labelIds.filter((id) => visibleIds.has(id));

		if (defaultLabelIds.length > 0 && prunedLabelIds.length === 0) {
			if (lastAppliedDefaultLabels.current !== defaultSignature) {
				setLabelIds(defaultLabelIds);
				lastAppliedDefaultLabels.current = defaultSignature;
			}
			return;
		}

		if (prunedLabelIds.length !== labelIds.length) {
			setLabelIds(prunedLabelIds);
		}
	}, [
		defaultLabelIds,
		labelIds,
		labelsQuery.isSuccess,
		requiresLabelMatch,
		setLabelIds,
		visibleLabels,
	]);

	// Effective filter: explicit selected visible labels. Namespace defaults are
	// written into filter state above so the picker and query stay in sync.
	const effectiveLabelIds = useMemo(
		() => (requiresLabelMatch || visibleSelectedLabelIds.length > 0 ? visibleSelectedLabelIds : []),
		[visibleSelectedLabelIds, requiresLabelMatch],
	);
	const canFetchIssues =
		labelsQuery.isSuccess &&
		filters.teamIds.length > 0 &&
		(!requiresLabelMatch || effectiveLabelIds.length > 0);
	const issueQueryBlockedMessage = labelsQuery.isSuccess
		? requiresLabelMatch && effectiveLabelIds.length === 0
			? "No labels match the configured namespace."
			: undefined
		: "Loading labels…";

	return (
		// Narrow screens stack the header over the calendar. Wide ones give the
		// calendar the full height on the left and stack the header over the
		// always-open issue panel on the right; MonthList renders the calendar
		// and the panel as two cells of this grid.
		<div className="flex h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_minmax(0,1fr)]">
			{/* Three controls and nothing else: Today moves the view, + starts an
			    issue, and Options holds the filters, view toggles, theme, and
			    refresh. The mark lives in the calendar's top-left corner. h-12
			    matches the calendar's weekday row so their borders line up. */}
			<header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-card px-4 lg:col-start-2 lg:row-start-1 lg:border-l">
				<Button
					type="button"
					appearance="outlined"
					intent="accent"
					onClick={() => listRef.current?.scrollToToday()}
				>
					Today
				</Button>
				{/* Ghost icons, like Options beside it: Today is the only boxed
				    control, so the header reads as one button and two icons. */}
				<IconButton
					type="button"
					appearance="ghost"
					intent="neutral"
					label="New issue"
					title="New issue"
					icon={<Plus />}
					onClick={() => listRef.current?.newIssue(toISODate(new Date()))}
				/>
				<OptionsMenu
					options={options}
					onToggle={toggle}
					projectLabel={projectLabel}
					filters={
						<FilterMenus
							teams={teams}
							teamsLoading={teamsQuery.isLoading}
							teamIds={filters.teamIds}
							labelIds={filters.labelIds}
							labels={visibleLabels}
							onToggleTeam={filters.toggleTeam}
							onToggleLabelGroup={filters.toggleLabelGroup}
							onClearLabels={filters.clearLabels}
						/>
					}
				/>
			</header>

			<MonthList
				ref={listRef}
				teamIds={filters.teamIds}
				labelIds={effectiveLabelIds}
				options={options}
				canFetchIssues={canFetchIssues}
				blockedMessage={issueQueryBlockedMessage}
			/>
		</div>
	);
}
