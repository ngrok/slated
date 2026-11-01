import { cx } from "@ngrok/mantle/cx";

// Linear priority scale: 0 none, 1 urgent, 2 high, 3 medium, 4 low.

/** Linear's priorities, in the order Linear's own menu lists them. */
export const PRIORITIES = [
	{ value: 0, label: "No priority" },
	{ value: 1, label: "Urgent" },
	{ value: 2, label: "High" },
	{ value: 3, label: "Medium" },
	{ value: 4, label: "Low" },
];

const FILLED_BARS: Record<number, number> = { 2: 3, 3: 2, 4: 1 };

const BARS = [
	{ x: 1.5, y: 8.5, h: 4 },
	{ x: 5.75, y: 5.5, h: 7 },
	{ x: 10, y: 2.5, h: 10 },
];

/**
 * Linear-style priority glyph: ascending bars with the lowest `level` filled,
 * and a filled exclamation square for urgent. Inherits text color (so a parent
 * `text-muted` keeps it quiet); urgent forces its own warning tint.
 */
export function PriorityIcon({
	priority,
	label,
	className,
}: {
	priority: number;
	label?: string;
	className?: string;
}) {
	if (priority === 1) {
		return (
			<svg
				viewBox="0 0 14 14"
				role="img"
				className={cx("size-3.5 shrink-0 text-[#f5a623]", className)}
				fill="currentColor"
			>
				<title>{label ?? "Urgent"}</title>
				<rect x="1" y="1" width="12" height="12" rx="3" />
				<rect x="6.25" y="3.5" width="1.5" height="4.5" rx="0.75" fill="#fff" />
				<rect x="6.25" y="9.25" width="1.5" height="1.5" rx="0.75" fill="#fff" />
			</svg>
		);
	}

	const filled = FILLED_BARS[priority] ?? 0;
	return (
		<svg
			viewBox="0 0 14 14"
			role="img"
			className={cx("size-3.5 shrink-0", className)}
			fill="currentColor"
		>
			<title>{label ?? "Priority"}</title>
			{BARS.map((bar, i) => (
				<rect
					key={bar.x}
					x={bar.x}
					y={bar.y}
					width="2.5"
					height={bar.h}
					rx="0.75"
					className={i < filled ? undefined : "opacity-30"}
				/>
			))}
		</svg>
	);
}
