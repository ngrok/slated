import darkCssUrl from "@ngrok/mantle/mantle-dark.css?url";
import darkHighContrastCssUrl from "@ngrok/mantle/mantle-dark-high-contrast.css?url";
import lightHighContrastCssUrl from "@ngrok/mantle/mantle-light-high-contrast.css?url";
import {
	extractThemeCookie,
	MantleStyleSheets,
	mantleStyleSheetUrls,
	PreventWrongThemeFlashScript,
	ThemeProvider,
	useInitialHtmlThemeProps,
} from "@ngrok/mantle/theme";
import { Toaster } from "@ngrok/mantle/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { LinksFunction } from "react-router";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: stylesheet },
	// SVG first for browsers that take it; .ico is the fallback for those that
	// don't, and is what Windows and older Safari pick up.
	{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
	{ rel: "icon", href: "/favicon.ico", sizes: "48x48 32x32 16x16" },
	{ rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
];

/*
 * app.css only carries the light theme. Mantle ships the other three as
 * separate files that load behind a media query, so a light-mode visitor never
 * downloads them.
 */
const themeUrls = mantleStyleSheetUrls({
	darkCssUrl,
	lightHighContrastCssUrl,
	darkHighContrastCssUrl,
});

export function loader({ request }: Route.LoaderArgs) {
	// Mantle keeps the chosen theme in a cookie so the server can render the
	// right one on the first paint. Send only that cookie to the browser — the
	// full header also carries the Linear session.
	return { themeCookie: extractThemeCookie(request.headers.get("Cookie")) };
}

export function Layout({ children }: { children: React.ReactNode }) {
	// Layout also wraps the ErrorBoundary, which renders when the root loader
	// never ran, so treat the data as optional.
	const rootData = useRouteLoaderData<typeof loader>("root");
	const htmlThemeProps = useInitialHtmlThemeProps({ ssrCookie: rootData?.themeCookie });

	return (
		<html {...htmlThemeProps} lang="en" suppressHydrationWarning>
			<head>
				{/* Applies the stored theme before the first paint. Without it a
				    dark-mode visitor sees a flash of the light theme. */}
				<PreventWrongThemeFlashScript />
				<MantleStyleSheets {...themeUrls} ssrCookie={rootData?.themeCookie} />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				{/* The mark's slate, for the browser chrome on Android and on macOS
				    Safari's tab bar. */}
				<meta name="theme-color" content="#45556C" />
				<Meta />
				<Links />
			</head>
			<body className="bg-body text-strong">
				<ThemeProvider>
					{children}
					<Toaster />
				</ThemeProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	// One QueryClient per browser session. Created in state so it is stable
	// across re-renders and isn't shared between requests during SSR.
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						// Refetch when returning to the tab so issues changed in Linear
						// (new due dates, edits) show up without a manual reload.
						staleTime: 30_000,
						refetchOnWindowFocus: true,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
		</QueryClientProvider>
	);
}

export function ErrorBoundary({ error }: { error: unknown }) {
	let title = "Something went wrong";
	let detail = "An unexpected error occurred.";

	if (isRouteErrorResponse(error)) {
		title = `${error.status} ${error.statusText}`;
		detail = error.data;
	} else if (error instanceof Error) {
		detail = error.message;
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-2 p-8 text-center">
			<h1 className="text-2xl font-medium text-strong">{title}</h1>
			{/* Startup and configuration errors arrive as several formatted lines
			    (see lib/env.server). Keep their line breaks instead of collapsing
			    the guidance into one paragraph. */}
			{detail.includes("\n") ? (
				<pre className="max-w-full overflow-x-auto whitespace-pre-wrap text-left text-sm text-muted">
					{detail}
				</pre>
			) : (
				<p className="text-muted">{detail}</p>
			)}
		</main>
	);
}
