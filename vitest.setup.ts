import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia. Mantle's theme provider calls it to resolve the
// "system" theme, so give it a stub that reports no media query matches
// (prefers-color-scheme: light, no forced contrast).
if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

// jsdom has no ResizeObserver or scrollIntoView. cmdk, behind every picker,
// measures its list with the first and scrolls the active option with the
// second; neither matters to what the tests assert.
if (typeof window !== "undefined" && !window.ResizeObserver) {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}
