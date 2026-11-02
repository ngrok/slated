import { IconButton } from "@ngrok/mantle/button";
import { DropdownMenu } from "@ngrok/mantle/dropdown-menu";
import { ArrowsClockwise, DotsThree } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ThemeMenuRadioGroup } from "~/components/theme-menu";
import { invalidateCalendarGrid, useCalendarFetchCount } from "./queries";
import type { ViewOptions } from "./view-options";

const OPTION_LABELS: { key: keyof ViewOptions; label: string }[] = [
	{ key: "showWeekends", label: "Show weekends" },
	{ key: "showCompleted", label: "Show completed" },
	{ key: "showSubtasks", label: "Show sub-tasks" },
	{ key: "showProjects", label: "Show projects" },
];

/**
 * Everything in the header that isn't a per-visit action: the filters, the view
 * toggles, the theme, and a manual sync. Keeping them in one menu leaves the
 * header to Today and New issue.
 */
export function OptionsMenu({
	options,
	onToggle,
	projectLabel = [],
	filters,
}: {
	options: ViewOptions;
	onToggle: (key: keyof ViewOptions) => void;
	/**
	 * Project label names from LINEAR_PROJECT_LABEL, shown next to the projects
	 * toggle. A wrong label empties the calendar of projects and reports nothing,
	 * and the server reads the variable once at startup, so a stale value
	 * outlives an edit to .env. Naming the label here makes both visible.
	 */
	projectLabel?: string[];
	/** The team and label submenus (FilterMenus), shown first. */
	filters?: ReactNode;
}) {
	const queryClient = useQueryClient();
	const isFetching = useCalendarFetchCount() > 0;

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<IconButton type="button" appearance="ghost" label="Options" icon={<DotsThree />} />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="w-56">
				{filters ? (
					<>
						<DropdownMenu.Label>Filter</DropdownMenu.Label>
						{filters}
						<DropdownMenu.Separator />
					</>
				) : null}
				<DropdownMenu.Label>View</DropdownMenu.Label>
				{OPTION_LABELS.map(({ key, label }) => (
					<DropdownMenu.CheckboxItem
						key={key}
						checked={options[key]}
						// Hold the menu open so several toggles can be flipped at once.
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={() => onToggle(key)}
					>
						{label}
						{key === "showProjects" && projectLabel.length > 0 ? (
							<span
								className="ml-auto pl-2 text-xs text-muted"
								title={`Only projects labelled ${projectLabel.join(" or ")} reach the calendar (LINEAR_PROJECT_LABEL).`}
							>
								{projectLabel.join(", ")}
							</span>
						) : null}
					</DropdownMenu.CheckboxItem>
				))}

				<DropdownMenu.Separator />
				<DropdownMenu.Label>Theme</DropdownMenu.Label>
				<ThemeMenuRadioGroup />

				<DropdownMenu.Separator />
				<DropdownMenu.Item
					className="gap-2"
					disabled={isFetching}
					onSelect={(event) => {
						// The spinner below is the only sign a sync is running, so keep
						// the menu open long enough to show it.
						event.preventDefault();
						invalidateCalendarGrid(queryClient);
					}}
				>
					<ArrowsClockwise className={isFetching ? "animate-spin" : undefined} />
					{isFetching ? "Refreshing…" : "Refresh"}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}
