import { DropdownMenu } from "@ngrok/mantle/dropdown-menu";
import { ThemeIcon } from "@ngrok/mantle/icons";
import { isTheme, type Theme, themes, useTheme } from "@ngrok/mantle/theme";

const THEME_LABELS: Record<Theme, string> = {
	system: "System",
	light: "Light",
	dark: "Dark",
};

/**
 * System, light, and dark as menu items, for embedding in a DropdownMenu.Content.
 * Mantle writes the choice to a cookie and applies it to the <html> element, so
 * the whole app follows (see root.tsx).
 *
 * A dropdown only mounts its content once open, which is always after
 * hydration, so this needs none of the SSR guards a standalone trigger would.
 */
export function ThemeMenuRadioGroup() {
	const [theme, setTheme] = useTheme();

	return (
		<DropdownMenu.RadioGroup
			value={theme}
			onValueChange={(value) => {
				if (isTheme(value)) {
					setTheme(value);
				}
			}}
		>
			{themes.map((option) => (
				<DropdownMenu.RadioItem key={option} value={option}>
					<ThemeIcon theme={option} />
					{THEME_LABELS[option]}
				</DropdownMenu.RadioItem>
			))}
		</DropdownMenu.RadioGroup>
	);
}
