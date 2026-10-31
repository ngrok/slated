import { createContext } from "react";

/**
 * The id of the issue open in the side panel, so its card can show that it is
 * the one selected. A context rather than a prop, so selecting an issue
 * re-renders only the cards, not every month and day between them.
 */
export const SelectedIssueContext = createContext<string | null>(null);
