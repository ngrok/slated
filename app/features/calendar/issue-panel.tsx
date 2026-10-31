import { Button, IconButton } from "@ngrok/mantle/button";
import { Calendar } from "@ngrok/mantle/calendar";
import { Kbd } from "@ngrok/mantle/kbd";
import { Popover } from "@ngrok/mantle/popover";
import { makeToast, Toast } from "@ngrok/mantle/toast";
import {
	ArrowSquareOut,
	CalendarBlank,
	CaretDown,
	CaretUp,
	FolderOpen,
	Plus,
	UserCircle,
	X,
} from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { type ReactNode, useEffect, useState } from "react";
import { toISODate } from "./date-utils";
import { PersonAvatar } from "./person-avatar";
import { assigneeOptions, Picker, UNASSIGNED } from "./picker";
import { PRIORITIES, PriorityIcon } from "./priority-icon";
import {
	useClearDueDate,
	useIssueDescription,
	useLabels,
	useTeamMembers,
	useUpdateAssignee,
	useUpdateDueDate,
	useUpdateLabels,
	useUpdatePriority,
	useUpdateState,
	useWorkflowStates,
} from "./queries";
import { StatusIcon } from "./status-icon";
import type { CalendarIssue, LabelOption } from "./types";

function Property({ label, children }: { label: string; children: ReactNode }) {
	return (
		<>
			<dt className="pt-2 text-sm text-muted">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</>
	);
}

/**
 * The trigger look shared by every editable property: quiet ghost buttons, so
 * the panel reads as a list of values that each open a picker on click.
 */
const PROPERTY_BUTTON = "w-full justify-start";

/**
 * The selected issue, beside the calendar rather than over it, so the grid
 * stays visible and usable while it is open. J and K step to the next and
 * previous issue on the calendar and Esc closes, unless focus is in a text
 * field or a picker, menu, or dialog is open.
 *
 * Every property Slated can write is editable here. The project is a link
 * because Slated cannot move issues between projects.
 */
export function IssuePanel({
	issue,
	onClose,
	onStep,
}: {
	issue: CalendarIssue;
	onClose: () => void;
	onStep: (direction: 1 | -1) => void;
}) {
	const detail = useIssueDescription(issue.id);
	const { data: labelConfig } = useLabels();
	const { data: states = [] } = useWorkflowStates(issue.team.id);
	const { data: members = [] } = useTeamMembers(issue.team.id);
	const updateState = useUpdateState();
	const updateAssignee = useUpdateAssignee();
	const updatePriority = useUpdatePriority();
	const updateDueDate = useUpdateDueDate();
	const clearDueDate = useClearDueDate();
	const updateLabels = useUpdateLabels();
	const [dateOpen, setDateOpen] = useState(false);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) {
				return;
			}
			// An open picker, menu, or dialog owns the keyboard, Esc included.
			if (document.querySelector("[data-radix-popper-content-wrapper], [role=dialog]")) {
				return;
			}
			if (event.key === "j") {
				onStep(1);
			} else if (event.key === "k") {
				onStep(-1);
			} else if (event.key === "Escape") {
				onClose();
			} else {
				return;
			}
			event.preventDefault();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onStep, onClose]);

	// Only labels that exist in this issue's team can be applied to it.
	const labelOptions = (labelConfig?.labels ?? []).filter(
		(option) => option.idByTeam[issue.team.id] || option.globalIds.length > 0,
	);
	const appliedOptionKeys = labelOptions
		.filter((option) => option.ids.some((id) => issue.labels.some((label) => label.id === id)))
		.map(optionKey);

	function toggleTag(option: LabelOption) {
		const labelId = option.idByTeam[issue.team.id] ?? option.globalIds[0];
		if (!labelId) {
			return;
		}
		// Drop any id belonging to this option, then add the team-correct one when
		// turning it on. Labels from other options are preserved.
		const isOn = option.ids.some((id) => issue.labels.some((label) => label.id === id));
		const base = issue.labels.filter((label) => !option.ids.includes(label.id));
		const next = isOn ? base : [...base, { id: labelId, name: option.name, color: option.color }];
		updateLabels.mutate({ issueId: issue.id, labels: next });
	}

	function clearDate() {
		const { id, identifier, dueDate } = issue;
		clearDueDate.mutate(id);
		// The issue leaves the calendar, so there is nothing left to show here.
		onClose();
		makeToast(
			<Toast.Root priority="info">
				<Toast.Message>Cleared the due date on {identifier}.</Toast.Message>
				<Toast.Action onClick={() => updateDueDate.mutate({ issueId: id, dueDate })}>
					Undo
				</Toast.Action>
			</Toast.Root>,
		);
	}

	return (
		<aside
			aria-label={`Issue ${issue.identifier}`}
			className="flex w-full shrink-0 flex-col overflow-y-auto border-l border-card bg-base max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-xl sm:w-[26rem]"
		>
			<div className="flex items-center gap-1 border-b border-card px-4 py-2">
				<IconButton
					type="button"
					appearance="ghost"
					size="sm"
					label="Previous issue"
					icon={<CaretUp />}
					onClick={() => onStep(-1)}
				/>
				<IconButton
					type="button"
					appearance="ghost"
					size="sm"
					label="Next issue"
					icon={<CaretDown />}
					onClick={() => onStep(1)}
				/>
				<span className="ml-1 text-xs text-muted">
					<Kbd>K</Kbd> <Kbd>J</Kbd> to move
				</span>
				<IconButton
					type="button"
					appearance="ghost"
					size="sm"
					label="Close"
					icon={<X />}
					onClick={onClose}
					className="ml-auto"
				/>
			</div>

			<div className="flex flex-col gap-6 p-4">
				<div>
					<p className="text-xs font-medium tabular-nums text-muted">{issue.identifier}</p>
					<h2 className="text-pretty text-lg font-medium text-strong">{issue.title}</h2>
				</div>

				<dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
					<Property label="Status">
						<Picker
							placeholder="Change status…"
							emptyText="Loading statuses…"
							options={states.map((state) => ({
								value: state.id,
								label: state.name,
								icon: <StatusIcon type={state.type} color={state.color} className="size-4" />,
							}))}
							selected={[issue.state.id]}
							onSelect={(stateId) => {
								const state = states.find((candidate) => candidate.id === stateId);
								if (state && state.id !== issue.state.id) {
									const { id, name, color, type } = state;
									updateState.mutate({ issueId: issue.id, state: { id, name, color, type } });
								}
							}}
						>
							<Button
								type="button"
								appearance="ghost"
								aria-label={`Status: ${issue.state.name}`}
								className={PROPERTY_BUTTON}
							>
								<StatusIcon type={issue.state.type} color={issue.state.color} className="size-4" />
								{issue.state.name}
							</Button>
						</Picker>
					</Property>

					<Property label="Assignee">
						<Picker
							placeholder="Assign to…"
							emptyText="Loading people…"
							options={assigneeOptions(members)}
							selected={[issue.assignee?.id ?? UNASSIGNED]}
							onSelect={(value) => {
								const assignee = members.find((member) => member.id === value) ?? null;
								if ((assignee?.id ?? null) !== (issue.assignee?.id ?? null)) {
									updateAssignee.mutate({ issueId: issue.id, assignee });
								}
							}}
						>
							<Button
								type="button"
								appearance="ghost"
								aria-label={`Assignee: ${issue.assignee?.name ?? "Unassigned"}`}
								className={PROPERTY_BUTTON}
							>
								{issue.assignee ? (
									<>
										<PersonAvatar person={issue.assignee} />
										<span className="truncate">{issue.assignee.name}</span>
									</>
								) : (
									<>
										<UserCircle className="size-4 text-muted" />
										Unassigned
									</>
								)}
							</Button>
						</Picker>
					</Property>

					<Property label="Priority">
						<Picker
							placeholder="Set priority…"
							options={PRIORITIES.map((option) => ({
								value: String(option.value),
								label: option.label,
								icon: <PriorityIcon priority={option.value} className="size-4" />,
							}))}
							selected={[String(issue.priority)]}
							onSelect={(value) => {
								const option = PRIORITIES.find((candidate) => String(candidate.value) === value);
								if (option && option.value !== issue.priority) {
									updatePriority.mutate({
										issueId: issue.id,
										priority: option.value,
										label: option.label,
									});
								}
							}}
						>
							<Button
								type="button"
								appearance="ghost"
								aria-label={`Priority: ${issue.priorityLabel}`}
								className={PROPERTY_BUTTON}
							>
								<PriorityIcon priority={issue.priority} className="size-4" />
								{issue.priorityLabel}
							</Button>
						</Picker>
					</Property>

					<Property label="Due date">
						<div className="flex items-center gap-1">
							<Popover.Root open={dateOpen} onOpenChange={setDateOpen}>
								<Popover.Trigger asChild>
									<Button
										type="button"
										appearance="ghost"
										icon={<CalendarBlank />}
										aria-label={`Due date: ${format(parseISO(issue.dueDate), "MMMM d, yyyy")}`}
										className="min-w-0 flex-1 justify-start"
									>
										{format(parseISO(issue.dueDate), "MMM d, yyyy")}
									</Button>
								</Popover.Trigger>
								<Popover.Content
									align="start"
									className="z-50 w-auto rounded-md border border-card bg-card p-2 text-strong shadow-lg"
								>
									<Calendar
										mode="single"
										selected={parseISO(issue.dueDate)}
										onSelect={(date) => {
											if (date) {
												updateDueDate.mutate({ issueId: issue.id, dueDate: toISODate(date) });
												setDateOpen(false);
											}
										}}
									/>
								</Popover.Content>
							</Popover.Root>
							<Button type="button" appearance="ghost" onClick={clearDate}>
								Clear
							</Button>
						</div>
					</Property>

					<Property label="Project">
						{issue.project ? (
							<a
								href={issue.project.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex max-w-full items-center gap-1.5 pt-2 text-sm text-strong underline-offset-2 hover:underline"
							>
								<FolderOpen className="size-4 shrink-0 text-muted" />
								<span className="truncate">{issue.project.name}</span>
								<ArrowSquareOut className="size-3.5 shrink-0 text-muted" />
							</a>
						) : (
							<p className="pt-2 text-sm text-muted">No project</p>
						)}
					</Property>
				</dl>

				<section aria-label="Description">
					{detail.isLoading ? (
						<div className="h-16 animate-pulse rounded bg-card" />
					) : detail.data?.description ? (
						<p className="whitespace-pre-wrap break-words text-sm text-strong">
							{detail.data.description}
						</p>
					) : (
						<p className="text-sm text-muted">No description.</p>
					)}
				</section>

				<section>
					<h3 className="pb-2 text-sm text-muted">Tags</h3>
					<div className="flex flex-wrap items-center gap-1.5">
						{issue.labels.map((label) => (
							<span
								key={label.id}
								className="inline-flex items-center gap-1.5 rounded-full border border-card py-0.5 pr-1 pl-2 text-sm text-strong"
							>
								<span
									className="size-2 shrink-0 rounded-full"
									style={{ backgroundColor: label.color }}
								/>
								{label.name}
								<button
									type="button"
									aria-label={`Remove tag ${label.name}`}
									className="rounded-full p-0.5 text-muted hover:bg-card-hover hover:text-strong"
									onClick={() =>
										updateLabels.mutate({
											issueId: issue.id,
											labels: issue.labels.filter((candidate) => candidate.id !== label.id),
										})
									}
								>
									<X className="size-3" />
								</button>
							</span>
						))}
						<Picker
							multiple
							placeholder="Add or remove tags…"
							emptyText="No tags for this team."
							options={labelOptions.map((option) => ({
								value: optionKey(option),
								label: option.name,
								icon: (
									<span
										className="ml-1 size-2 shrink-0 rounded-full"
										style={{ backgroundColor: option.color }}
									/>
								),
							}))}
							selected={appliedOptionKeys}
							onSelect={(key) => {
								const option = labelOptions.find((candidate) => optionKey(candidate) === key);
								if (option) {
									toggleTag(option);
								}
							}}
						>
							<Button type="button" appearance="ghost" icon={<Plus />}>
								Tag
							</Button>
						</Picker>
					</div>
				</section>

				<a
					href={issue.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 self-start text-sm text-muted underline-offset-2 hover:text-strong hover:underline"
				>
					Open in Linear
					<ArrowSquareOut className="size-3.5" />
				</a>
			</div>
		</aside>
	);
}

/** A label option's stable key: the same name can be several Linear labels. */
function optionKey(option: LabelOption): string {
	return option.ids.join(",");
}
