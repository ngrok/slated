import { memo } from "react";

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/);
	const first = parts[0]?.[0] ?? "?";
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return (first + last).toUpperCase();
}

/**
 * A Linear member on a card: their avatar, or their initials when Linear has no
 * image for them. Shared by the issue card (the assignee) and the project card
 * (the lead).
 */
export const PersonAvatar = memo(function PersonAvatar({
	person,
}: {
	person: { name: string; displayName: string; avatarUrl: string | null };
}) {
	if (person.avatarUrl) {
		return (
			<img
				src={person.avatarUrl}
				alt={person.name}
				title={person.name}
				className="size-4 shrink-0 rounded-full"
			/>
		);
	}
	return (
		<span
			title={person.name}
			className="flex size-4 shrink-0 items-center justify-center rounded-full bg-filled-accent text-[8px] font-medium text-white"
		>
			{initialsOf(person.displayName || person.name)}
		</span>
	);
});
