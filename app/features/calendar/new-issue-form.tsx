import { Button } from "@ngrok/mantle/button";
import { Calendar } from "@ngrok/mantle/calendar";
import { Checkbox } from "@ngrok/mantle/checkbox";
import { Input } from "@ngrok/mantle/input";
import { Popover } from "@ngrok/mantle/popover";
import { Select } from "@ngrok/mantle/select";
import { TextArea } from "@ngrok/mantle/text-area";
import { CalendarBlank, UserCircle } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { type FormEvent, useState } from "react";
import { toISODate } from "./date-utils";
import { PersonAvatar } from "./person-avatar";
import { assigneeOptions, Picker, UNASSIGNED } from "./picker";
import { PRIORITIES, PriorityIcon } from "./priority-icon";
import { useCreateIssue, useLabels, useTeamMembers, useTeams, useWorkflowStates } from "./queries";
import { StatusIcon } from "./status-icon";
import type { CalendarIssue, LabelOption } from "./types";

/**
 * Re-point a set of selected labels at the team the issue will be created in.
 * The same label name exists as a separate label per team, so a selection made
 * for one team has to be resolved to the new team's ids — or dropped when that
 * team has no such label.
 */
function labelIdsForTeam(
	options: LabelOption[],
	selectedIds: string[],
	teamId: string | null,
): string[] {
	if (!teamId || selectedIds.length === 0) {
		return [];
	}
	const resolved: string[] = [];
	for (const option of options) {
		if (!option.ids.some((id) => selectedIds.includes(id))) {
			continue;
		}
		const id = option.idByTeam[teamId] ?? option.globalIds[0];
		if (id) {
			resolved.push(id);
		}
	}
	return resolved;
}

const SectionHeading = ({ children }: { children: string }) => (
	<h3 className="pb-1 text-xs font-medium uppercase tracking-wide text-muted">{children}</h3>
);

/**
 * Create a Linear issue from the calendar, in the side panel. `date` is the due
 * date the issue lands on: the header's + passes today, a day cell's + passes
 * its own day. The panel remounts the form per date so every open starts clean.
 */
export function NewIssueForm({
	date,
	defaultTeamId,
	onCreated,
	onCancel,
}: {
	date: string;
	defaultTeamId: string | null;
	/** Called with the created issue, so the panel can show it. */
	onCreated: (issue: CalendarIssue) => void;
	onCancel: () => void;
}) {
	const { data: teamsData } = useTeams();
	const teams = teamsData?.teams ?? [];
	const { data: labelConfig } = useLabels();
	const labelOptions = labelConfig?.labels ?? [];
	const requiresLabelMatch = labelConfig?.requiresLabelMatch ?? false;
	const createIssue = useCreateIssue();

	const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [dueDate, setDueDate] = useState(date);
	const [labelIds, setLabelIds] = useState<string[]>([]);
	const [stateId, setStateId] = useState<string | null>(null);
	const [priority, setPriority] = useState(0);
	const [assigneeId, setAssigneeId] = useState<string | null>(null);
	const [dateOpen, setDateOpen] = useState(false);

	const { data: states = [] } = useWorkflowStates(teamId);
	const selectedState = states.find((state) => state.id === stateId);
	const selectedPriority = PRIORITIES.find((option) => option.value === priority);
	const { data: members = [] } = useTeamMembers(teamId);
	const selectedAssignee = members.find((member) => member.id === assigneeId);
	// Only labels that exist in the chosen team can be applied to the issue.
	const applicableLabels = teamId
		? labelOptions.filter((option) => option.idByTeam[teamId] || option.globalIds.length > 0)
		: [];

	function changeTeam(nextTeamId: string) {
		setTeamId(nextTeamId);
		// Labels, statuses, and assignees are team-scoped: carry the labels across
		// by name, fall back to the new team's default status, and unassign.
		setLabelIds((prev) => labelIdsForTeam(labelOptions, prev, nextTeamId));
		setStateId(null);
		setAssigneeId(null);
	}

	function toggleTag(option: LabelOption) {
		if (!teamId) {
			return;
		}
		const labelId = option.idByTeam[teamId] ?? option.globalIds[0];
		if (!labelId) {
			return;
		}
		setLabelIds((prev) =>
			prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
		);
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!teamId || !title.trim()) {
			return;
		}
		createIssue.mutate(
			{
				teamId,
				title: title.trim(),
				description: description.trim() || undefined,
				dueDate,
				labelIds,
				stateId: stateId ?? undefined,
				priority,
				assigneeId: assigneeId ?? undefined,
			},
			{ onSuccess: (issue) => onCreated(issue) },
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
			<section>
				<SectionHeading>Title</SectionHeading>
				<Input
					autoFocus
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="What are we publishing?"
					aria-label="Title"
				/>
			</section>

			<section>
				<SectionHeading>Description</SectionHeading>
				<TextArea
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Optional details"
					aria-label="Description"
					rows={4}
				/>
			</section>

			<section>
				<SectionHeading>Team</SectionHeading>
				<Select.Root value={teamId ?? undefined} onValueChange={changeTeam}>
					<Select.Trigger aria-label="Team">
						<Select.Value placeholder="Select a team" />
					</Select.Trigger>
					<Select.Content>
						{teams.map((team) => (
							<Select.Item key={team.id} value={team.id}>
								{team.name}
							</Select.Item>
						))}
					</Select.Content>
				</Select.Root>
			</section>

			<div className="flex flex-wrap gap-4">
				<section>
					<SectionHeading>Due date (publish)</SectionHeading>
					<Popover.Root open={dateOpen} onOpenChange={setDateOpen}>
						<Popover.Trigger asChild>
							<Button type="button" appearance="outlined" intent="accent" icon={<CalendarBlank />}>
								{format(parseISO(dueDate), "MMM d, yyyy")}
							</Button>
						</Popover.Trigger>
						<Popover.Content className="z-50 w-auto rounded-md border border-card bg-card p-2 text-strong shadow-lg">
							<Calendar
								mode="single"
								selected={parseISO(dueDate)}
								onSelect={(selected) => {
									if (selected) {
										setDueDate(toISODate(selected));
										setDateOpen(false);
									}
								}}
							/>
						</Popover.Content>
					</Popover.Root>
				</section>

				<section>
					<SectionHeading>Status</SectionHeading>
					<Picker
						placeholder="Change status…"
						emptyText={teamId ? "Loading statuses…" : "Select a team first."}
						options={states.map((state) => ({
							value: state.id,
							label: state.name,
							icon: <StatusIcon type={state.type} color={state.color} className="size-4" />,
						}))}
						selected={stateId ? [stateId] : []}
						onSelect={setStateId}
					>
						<Button type="button" appearance="outlined" intent="accent" aria-label="Status">
							{selectedState ? (
								<>
									<StatusIcon
										type={selectedState.type}
										color={selectedState.color}
										className="size-4"
									/>
									{selectedState.name}
								</>
							) : (
								"Team default"
							)}
						</Button>
					</Picker>
				</section>

				<section>
					<SectionHeading>Priority</SectionHeading>
					<Picker
						placeholder="Set priority…"
						options={PRIORITIES.map((option) => ({
							value: String(option.value),
							label: option.label,
							icon: <PriorityIcon priority={option.value} className="size-4" />,
						}))}
						selected={[String(priority)]}
						onSelect={(value) => setPriority(Number(value))}
					>
						<Button type="button" appearance="outlined" intent="accent" aria-label="Priority">
							<PriorityIcon priority={priority} className="size-4" />
							{selectedPriority?.label}
						</Button>
					</Picker>
				</section>

				<section>
					<SectionHeading>Assignee</SectionHeading>
					<Picker
						placeholder="Assign to…"
						emptyText={teamId ? "Loading people…" : "Select a team first."}
						options={assigneeOptions(members)}
						selected={[assigneeId ?? UNASSIGNED]}
						onSelect={(value) => setAssigneeId(value === UNASSIGNED ? null : value)}
					>
						<Button type="button" appearance="outlined" intent="accent" aria-label="Assignee">
							{selectedAssignee ? (
								<>
									<PersonAvatar person={selectedAssignee} />
									{selectedAssignee.name}
								</>
							) : (
								<>
									<UserCircle className="size-4 text-muted" />
									Unassigned
								</>
							)}
						</Button>
					</Picker>
				</section>
			</div>

			<section>
				<SectionHeading>Tags</SectionHeading>
				{applicableLabels.length === 0 ? (
					<p className="text-sm text-muted">
						{teamId ? "No tags for this team." : "Select a team to pick tags."}
					</p>
				) : (
					<div className="flex max-h-40 flex-col gap-1 overflow-auto">
						{applicableLabels.map((option) => {
							const labelId = option.idByTeam[teamId as string] ?? option.globalIds[0];
							const checkboxId = `new-issue-label-${option.ids.join("-")}`;
							return (
								<label
									key={option.ids.join("-")}
									htmlFor={checkboxId}
									className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-card"
								>
									<Checkbox
										id={checkboxId}
										checked={Boolean(labelId) && labelIds.includes(labelId as string)}
										onChange={() => toggleTag(option)}
									/>
									<span
										className="size-2 shrink-0 rounded-full"
										style={{ backgroundColor: option.color }}
									/>
									<span className="truncate text-sm text-strong">{option.name}</span>
								</label>
							);
						})}
					</div>
				)}
				{requiresLabelMatch && labelIds.length === 0 ? (
					<p className="pt-1 text-xs text-muted">
						Without a tag, this issue won&apos;t appear on the filtered calendar.
					</p>
				) : null}
			</section>

			<div className="flex justify-end gap-2">
				<Button type="button" appearance="ghost" intent="accent" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					type="submit"
					appearance="filled"
					intent="accent"
					isLoading={createIssue.isPending}
					disabled={!teamId || title.trim().length === 0 || createIssue.isPending}
				>
					Create issue
				</Button>
			</div>
		</form>
	);
}
