import { Command } from "@ngrok/mantle/command";
import { Popover } from "@ngrok/mantle/popover";
import { Check, UserCircle } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { PersonAvatar } from "./person-avatar";
import type { TeamMember } from "./types";

export type PickerOption = { value: string; label: string; icon?: ReactNode };

/** The assignee picker's value for "nobody"; cmdk needs a non-empty value. */
export const UNASSIGNED = "unassigned";

/** "Unassigned" followed by the team's members, for an assignee picker. */
export function assigneeOptions(members: TeamMember[]): PickerOption[] {
	return [
		{ value: UNASSIGNED, label: "Unassigned", icon: <UserCircle className="size-4 text-muted" /> },
		...members.map((member) => ({
			value: member.id,
			label: member.name,
			icon: <PersonAvatar person={member} />,
		})),
	];
}

/**
 * Every "choose from a list" control: a popover with a filter input over a
 * list that the arrow keys move through, Enter picks from, and Esc closes. One
 * component, so status, priority, assignee, and tags behave the same way
 * wherever they appear.
 *
 * `children` is the trigger, rendered as the popover's trigger element. With
 * `multiple`, the popover stays open so several options can be toggled.
 */
export function Picker({
	children,
	options,
	selected,
	onSelect,
	placeholder,
	emptyText = "No matches.",
	multiple = false,
}: {
	children: ReactNode;
	options: PickerOption[];
	selected: string[];
	onSelect: (value: string) => void;
	/** Shown in the filter input, and its accessible name. */
	placeholder: string;
	/** Shown when nothing matches the filter, or there are no options yet. */
	emptyText?: string;
	multiple?: boolean;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger asChild>{children}</Popover.Trigger>
			<Popover.Content
				align="start"
				preferredWidth="max-w-64"
				className="z-50 w-64 rounded-md border border-card bg-card p-0 text-strong shadow-lg"
			>
				<Command.Root loop>
					<Command.Input placeholder={placeholder} aria-label={placeholder} />
					<Command.List>
						<Command.Empty className="py-3 text-muted">{emptyText}</Command.Empty>
						<Command.Group>
							{options.map((option) => (
								<Command.Item
									key={option.value}
									// cmdk filters on value and keywords; ids are unique, labels read.
									value={option.value}
									keywords={[option.label]}
									onSelect={() => {
										onSelect(option.value);
										if (!multiple) {
											setOpen(false);
										}
									}}
								>
									{option.icon}
									<span className="flex-1 truncate">{option.label}</span>
									{selected.includes(option.value) ? (
										<Check className="size-4 shrink-0 text-muted" aria-label="Selected" />
									) : null}
								</Command.Item>
							))}
						</Command.Group>
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	);
}
