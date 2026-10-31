import { useId } from "react";

/**
 * The Slated mark and wordmark.
 *
 * The mark is a calendar tile with one day filled in: the day a piece of work
 * is slated for. It is inlined as SVG rather than loaded from `/favicon.svg` so
 * it paints with the first render and needs no extra request. Colors are fixed
 * to the brand slate instead of `currentColor`, because the mark has to read the
 * same way on the light and dark surfaces mantle gives us. That is also why it
 * uses a mid slate rather than the near-black accent of a filled button.
 *
 * Geometry note: the tile is drawn as two rects behind a clip path rather than
 * as a rounded rect plus an arc-capped band. That keeps the band a straight
 * line, and it leaves the day grid inset by 4 at the sides and 3.5 above and
 * below, which reads as even. Sizing the band with an arc instead pushed the
 * bottom row to within 1.5 of the tile edge, and it showed at 16px.
 */

/** Tailwind's slate-600: mid-tone, so the tile holds up on light and dark tabs. */
const TILE = "#45556C";
/** Tailwind's slate-800, for the calendar binding across the top. */
const BINDING = "#1D293D";
/** Unmarked days. Low enough to recede, high enough to survive a 16px favicon. */
const DAY_OPACITY = 0.5;

export function Mark({ size = 20, className }: { size?: number; className?: string }) {
	// Two marks can share a page (header and dialog), and duplicate clip-path
	// ids would make one of them clip against the other's rect.
	const clipId = `slated-tile-${useId()}`;

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			className={className}
			role="img"
			aria-label="Slated"
		>
			<defs>
				<clipPath id={clipId}>
					<rect x="4" y="3" width="24" height="26" rx="5.5" />
				</clipPath>
			</defs>
			<g clipPath={`url(#${clipId})`}>
				<rect x="4" y="3" width="24" height="26" fill={TILE} />
				<rect x="4" y="3" width="24" height="5" fill={BINDING} />
			</g>
			<g fill="#FFFFFF">
				<rect x="8" y="11.5" width="6.5" height="5.5" rx="1.5" opacity={DAY_OPACITY} />
				<rect x="17.5" y="11.5" width="6.5" height="5.5" rx="1.5" opacity={DAY_OPACITY} />
				<rect x="8" y="20" width="6.5" height="5.5" rx="1.5" opacity={DAY_OPACITY} />
				<rect x="17.5" y="20" width="6.5" height="5.5" rx="1.5" />
			</g>
		</svg>
	);
}

/** Mark plus name. `lg` is for the sign-in screen, `sm` for the app header. */
export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
	const large = size === "lg";
	return (
		<span className="flex items-center gap-2">
			{/* The mark is decorative next to the name, which already reads as the
			    product, so hide the SVG's own label from screen readers here. */}
			<span aria-hidden="true" className="flex">
				<Mark size={large ? 36 : 22} />
			</span>
			<span
				className={
					large
						? "text-4xl font-medium tracking-tight text-strong"
						: "text-xl font-medium tracking-tight text-strong"
				}
			>
				Slated
			</span>
		</span>
	);
}
