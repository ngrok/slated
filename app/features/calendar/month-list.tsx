import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { cx } from "@ngrok/mantle/cx";
import { useQueryClient } from "@tanstack/react-query";
import { addMonths, startOfMonth } from "date-fns";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Mark } from "~/components/wordmark";
import { monthGridRange, toISODate, WEEKDAY_LABELS } from "./date-utils";
import { DRAG_DISTANCE_PX } from "./draggable-issue-card";
import { IssueCard } from "./issue-card";
import { IssuePanel } from "./issue-panel";
import { MonthSection } from "./month-section";
import { ProjectCard } from "./project-card";
import {
	prefetchCalendarIssues,
	prefetchCalendarProjects,
	useCalendarFetchCount,
	useUpdateDueDate,
	useUpdateTargetDate,
} from "./queries";
import { SelectedIssueContext } from "./selected-issue";
import type { CalendarIssue, CalendarProject } from "./types";
import { useToday } from "./use-today";
import type { ViewOptions } from "./view-options";

// How many months to render initially: one before "today" plus a few after, so
// the viewport is filled and the observer takes over from there.
const INITIAL_OFFSETS = [-1, 0, 1, 2];
const TODAY_SCROLL_FRACTION = 0.3;

// Render a placeholder until mounted so the date-dependent grid doesn't differ
// between server and first client render (avoids hydration mismatch), and so
// the relative /api/issues fetches only ever run in the browser.
function useHydrated(): boolean {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	return hydrated;
}

/**
 * Find an issue by id across every cached calendar-issues query, reactively.
 * The side panel is driven from this so optimistic edits (reschedule, retag) reflect
 * immediately regardless of which month section currently holds the issue.
 */
function useIssueById(id: string | null): CalendarIssue | null {
	const queryClient = useQueryClient();
	return useSyncExternalStore(
		(onChange) => queryClient.getQueryCache().subscribe(onChange),
		() => {
			if (!id) {
				return null;
			}
			const entries = queryClient.getQueriesData<CalendarIssue[]>({
				queryKey: ["calendar", "issues"],
			});
			for (const [, data] of entries) {
				const found = data?.find((issue) => issue.id === id);
				if (found) {
					return found;
				}
			}
			return null;
		},
		() => null,
	);
}

const NO_ISSUES: CalendarIssue[] = [];

/**
 * Every issue the calendar has loaded for the current filters, once each, for
 * the panel's overview. It reads the cache the month sections fill rather than
 * fetching, so it covers the months rendered so far. The snapshot is rebuilt
 * only when a matching query's data changes, which useSyncExternalStore needs
 * to avoid re-rendering forever.
 */
function useLoadedIssues(teamIds: string[], labelIds: string[]): CalendarIssue[] {
	const queryClient = useQueryClient();
	const last = useRef<{ filter: string; datas: unknown[]; issues: CalendarIssue[] }>({
		filter: "",
		datas: [],
		issues: NO_ISSUES,
	});
	const filter = `${teamIds.join(",")}|${labelIds.join(",")}`;
	const subscribe = useCallback(
		(onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
		[queryClient],
	);
	return useSyncExternalStore(
		subscribe,
		() => {
			// Keys are [root, "issues", start, end, teamIds, labelIds] (calendarKeys).
			const datas = queryClient
				.getQueriesData<CalendarIssue[]>({ queryKey: ["calendar", "issues"] })
				.filter(([key]) => `${key[4]}|${key[5]}` === filter)
				.map(([, data]) => data);
			const prev = last.current;
			if (
				prev.filter === filter &&
				prev.datas.length === datas.length &&
				prev.datas.every((data, index) => data === datas[index])
			) {
				return prev.issues;
			}
			// Neighbouring months overlap at the edges of their grids.
			const byId = new Map<string, CalendarIssue>();
			for (const data of datas) {
				for (const issue of data ?? []) {
					byId.set(issue.id, issue);
				}
			}
			last.current = { filter, datas, issues: [...byId.values()] };
			return last.current.issues;
		},
		() => NO_ISSUES,
	);
}

/**
 * What a dragged card carries: exactly one of an issue or a project, set by
 * DraggableIssueCard / DraggableProjectCard.
 */
type DragPayload = { issue?: CalendarIssue; project?: CalendarProject };

function dragPayload(data: unknown): DragPayload | null {
	const payload = data as DragPayload | undefined;
	if (payload?.issue || payload?.project) {
		return payload;
	}
	return null;
}

/** Imperative handle so the page header's "Today" button can scroll the list. */
export type MonthListHandle = {
	scrollToToday: () => void;
	/** Open the new-issue form in the side panel, due on the given day. */
	newIssue: (dueDate: string) => void;
};

export const MonthList = forwardRef<
	MonthListHandle,
	{
		teamIds: string[];
		labelIds: string[];
		options: ViewOptions;
		canFetchIssues: boolean;
		blockedMessage?: string;
	}
>(function MonthList({ teamIds, labelIds, options, canFetchIssues, blockedMessage }, ref) {
	const hydrated = useHydrated();
	const queryClient = useQueryClient();
	const gridFetchCount = useCalendarFetchCount();
	const today = useToday();
	const noTeams = teamIds.length === 0;

	const [months, setMonths] = useState<Date[]>(() => {
		const base = startOfMonth(new Date());
		return INITIAL_OFFSETS.map((offset) => addMonths(base, offset));
	});
	const currentMonthIso = useMemo(() => toISODate(startOfMonth(today)), [today]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const todayRef = useRef<HTMLDivElement>(null);
	const topSentinelRef = useRef<HTMLDivElement>(null);
	const bottomSentinelRef = useRef<HTMLDivElement>(null);
	// scrollHeight captured just before a prepend, used to keep the viewport
	// anchored when months are added above.
	const prevScrollHeight = useRef<number | null>(null);

	// A fixed left gutter column (for the floating month label) plus the day
	// columns. Months render their owned weeks into this template so they line up.
	const gridColsClass = options.showWeekends
		? "grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]"
		: "grid-cols-[4.5rem_repeat(5,minmax(0,1fr))]";
	const weekdayLabels = options.showWeekends ? WEEKDAY_LABELS : WEEKDAY_LABELS.slice(0, 5);

	const appendMonth = useCallback(() => {
		setMonths((ms) => {
			const last = ms[ms.length - 1];
			return last ? [...ms, addMonths(last, 1)] : ms;
		});
	}, []);

	const prependMonth = useCallback(() => {
		const el = scrollRef.current;
		if (el) {
			prevScrollHeight.current = el.scrollHeight;
		}
		setMonths((ms) => {
			const first = ms[0];
			return first ? [addMonths(first, -1), ...ms] : ms;
		});
	}, []);

	// After a prepend, restore the scroll position so the content the user was
	// looking at doesn't jump down. Keyed on `months` so it re-runs on every
	// add (the value itself isn't read — the prepend flag does the work).
	// biome-ignore lint/correctness/useExhaustiveDependencies: months is the intended trigger
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (el && prevScrollHeight.current != null) {
			el.scrollTop += el.scrollHeight - prevScrollHeight.current;
			prevScrollHeight.current = null;
		}
	}, [months]);

	const scrollToToday = useCallback(() => {
		const root = scrollRef.current;
		const target = todayRef.current;
		if (!root || !target) {
			return;
		}
		const rootRect = root.getBoundingClientRect();
		const targetRect = target.getBoundingClientRect();
		const targetTopInScroll = targetRect.top - rootRect.top + root.scrollTop;
		const nextTop = Math.max(0, targetTopInScroll - root.clientHeight * TODAY_SCROLL_FRACTION);
		root.scrollTo({ top: nextTop });
	}, []);

	// Land on today on first paint, then correct once the first fetch settles,
	// because cards above today can change row heights.
	const didInit = useRef(false);
	const sawInitialFetch = useRef(false);
	const initFallbackTimer = useRef<number | null>(null);
	useLayoutEffect(() => {
		if (hydrated && canFetchIssues && !didInit.current && todayRef.current) {
			scrollToToday();
			initFallbackTimer.current = window.setTimeout(() => {
				if (!didInit.current) {
					scrollToToday();
					didInit.current = true;
				}
			}, 750);
		}
		return () => {
			if (initFallbackTimer.current != null) {
				window.clearTimeout(initFallbackTimer.current);
				initFallbackTimer.current = null;
			}
		};
	}, [hydrated, canFetchIssues, scrollToToday]);

	useEffect(() => {
		if (!hydrated || !canFetchIssues || didInit.current) {
			return;
		}
		if (gridFetchCount > 0) {
			sawInitialFetch.current = true;
			return;
		}
		if (!sawInitialFetch.current) {
			return;
		}

		const frame = window.requestAnimationFrame(() => {
			scrollToToday();
			didInit.current = true;
			if (initFallbackTimer.current != null) {
				window.clearTimeout(initFallbackTimer.current);
				initFallbackTimer.current = null;
			}
		});
		return () => window.cancelAnimationFrame(frame);
	}, [hydrated, canFetchIssues, gridFetchCount, scrollToToday]);

	// Grow the list in whichever direction the user scrolls.
	useEffect(() => {
		const root = scrollRef.current;
		if (!root || !hydrated || noTeams || !canFetchIssues) {
			return;
		}
		const top = topSentinelRef.current;
		const bottom = bottomSentinelRef.current;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) {
						continue;
					}
					if (entry.target === bottom) {
						appendMonth();
					} else if (entry.target === top) {
						prependMonth();
					}
				}
			},
			{ root, rootMargin: "400px 0px" },
		);
		if (top) {
			observer.observe(top);
		}
		if (bottom) {
			observer.observe(bottom);
		}
		return () => observer.disconnect();
	}, [hydrated, noTeams, canFetchIssues, appendMonth, prependMonth]);

	// Warm the cache just beyond each edge so a freshly revealed month rarely
	// has to pop in empty (which would also shift the prepend anchor).
	useEffect(() => {
		if (!canFetchIssues) {
			return;
		}
		const first = months[0];
		const last = months[months.length - 1];
		if (!first || !last) {
			return;
		}
		const edges = [addMonths(first, -1), addMonths(last, 1)];
		for (const month of edges) {
			const range = monthGridRange(month);
			const start = toISODate(range.gridStart);
			const end = toISODate(range.gridEnd);
			prefetchCalendarIssues(queryClient, { start, end, teamIds, labelIds });
			if (options.showProjects) {
				prefetchCalendarProjects(queryClient, { start, end, teamIds });
			}
		}
	}, [months, queryClient, teamIds, labelIds, canFetchIssues, options.showProjects]);

	// Issue side panel, driven reactively from the cache (see useIssueById). It
	// holds one thing at a time: an issue, the new-issue form, or nothing.
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
	const [newIssueDate, setNewIssueDate] = useState<string | null>(null);
	const selectedIssue = useIssueById(selectedIssueId);
	const loadedIssues = useLoadedIssues(teamIds, labelIds);
	// The overview leaves out what the calendar hides.
	const overviewIssues = useMemo(
		() => (options.showSubtasks ? loadedIssues : loadedIssues.filter((issue) => !issue.parent)),
		[loadedIssues, options.showSubtasks],
	);
	const handleOpenIssue = useCallback((issue: CalendarIssue) => {
		setNewIssueDate(null);
		setSelectedIssueId(issue.id);
	}, []);
	const openNewIssue = useCallback((dueDate: string) => {
		setSelectedIssueId(null);
		setNewIssueDate(dueDate);
	}, []);
	const closeIssue = useCallback(() => {
		setSelectedIssueId(null);
		setNewIssueDate(null);
	}, []);
	useImperativeHandle(ref, () => ({ scrollToToday, newIssue: openNewIssue }), [
		scrollToToday,
		openNewIssue,
	]);
	// The grid already renders the visible issues in calendar order (weeks top
	// to bottom, days left to right, cards top to bottom), filtered by the view
	// options, so the next issue is simply the next card in the document. With
	// nothing open, start from the first card in view.
	const stepIssue = useCallback(
		(direction: 1 | -1) => {
			const root = scrollRef.current;
			const cards = [...(root?.querySelectorAll<HTMLElement>("[data-issue-id]") ?? [])];
			const index = cards.findIndex((card) => card.dataset.issueId === selectedIssueId);
			const viewTop = root?.getBoundingClientRect().top ?? 0;
			const next =
				index === -1
					? cards.find((card) => card.getBoundingClientRect().top >= viewTop)
					: cards[index + direction];
			if (next?.dataset.issueId) {
				setSelectedIssueId(next.dataset.issueId);
				next.scrollIntoView({ block: "nearest" });
			}
		},
		[selectedIssueId],
	);

	// Drag-to-reschedule across the whole visible list. A card carries either an
	// issue or a project, and each writes its own date field.
	const updateDueDate = useUpdateDueDate();
	const updateTargetDate = useUpdateTargetDate();
	const [activeCard, setActiveCard] = useState<DragPayload | null>(null);
	// Anything shorter than this is a click that opens the issue (see DraggableIssueCard).
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: DRAG_DISTANCE_PX } }),
	);

	function handleDragStart(event: DragStartEvent) {
		setActiveCard(dragPayload(event.active.data.current));
	}

	function handleDragEnd(event: DragEndEvent) {
		const dragged = dragPayload(event.active.data.current);
		setActiveCard(null);
		const day = event.over?.id;
		if (!dragged || typeof day !== "string") {
			return;
		}
		if (dragged.issue) {
			if (day !== dragged.issue.dueDate) {
				updateDueDate.mutate({ issueId: dragged.issue.id, dueDate: day });
			}
			return;
		}
		if (dragged.project && day !== dragged.project.targetDate) {
			updateTargetDate.mutate({ projectId: dragged.project.id, targetDate: day });
		}
	}

	// The calendar and the panel are returned side by side, not wrapped, so they
	// land in CalendarPage's grid next to its header.
	const panel = (
		<IssuePanel
			issue={selectedIssue}
			newIssue={newIssueDate ? { date: newIssueDate, defaultTeamId: teamIds[0] ?? null } : null}
			overviewIssues={overviewIssues}
			onOpenIssue={handleOpenIssue}
			onClose={closeIssue}
			onStep={stepIssue}
			// Show what was just created. One the filters hide isn't in the cache,
			// so the panel falls back to its empty state.
			onCreated={(issue) => handleOpenIssue(issue)}
		/>
	);
	// The app's mark sits in the grid's top-left corner, above the month labels.
	const corner = (
		<h1 className="flex">
			<Mark size={24} />
		</h1>
	);
	const mainClass =
		"flex min-h-0 min-w-0 flex-1 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1";

	if (noTeams || !canFetchIssues) {
		return (
			<>
				<main className={mainClass}>
					<div className="flex items-center gap-3 p-4">
						{corner}
						<p className="text-sm text-muted">
							{noTeams
								? "Select at least one team to see issues."
								: (blockedMessage ?? "Select labels to see issues.")}
						</p>
					</div>
				</main>
				{panel}
			</>
		);
	}

	return (
		<>
			<main className={mainClass}>
				{hydrated ? (
					<DndContext
						sensors={sensors}
						collisionDetection={pointerWithin}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
					>
						<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
							<div ref={topSentinelRef} className="h-px" />
							<div
								className={cx(
									"sticky top-0 z-20 grid h-12 items-center border-b border-card-muted bg-base",
									gridColsClass,
								)}
							>
								<div className="flex items-center pl-4">{corner}</div>
								{weekdayLabels.map((label) => (
									<div key={label} className="px-1 text-base font-medium text-muted">
										{label}
									</div>
								))}
							</div>
							<div className="border-r border-card-muted">
								<SelectedIssueContext.Provider value={selectedIssueId}>
									{months.map((month) => (
										<MonthSection
											key={toISODate(month)}
											ref={toISODate(month) === currentMonthIso ? todayRef : undefined}
											month={month}
											teamIds={teamIds}
											labelIds={labelIds}
											enabled={canFetchIssues}
											options={options}
											today={today}
											gridColsClass={gridColsClass}
											onOpenIssue={handleOpenIssue}
											onNewIssue={openNewIssue}
										/>
									))}
								</SelectedIssueContext.Provider>
							</div>
							<div ref={bottomSentinelRef} className="h-px" />
						</div>
						<DragOverlay>
							{activeCard ? (
								<div className="w-40 rotate-2 opacity-90">
									{activeCard.issue ? <IssueCard issue={activeCard.issue} /> : null}
									{activeCard.project ? <ProjectCard project={activeCard.project} /> : null}
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
				) : (
					<div className="h-96 animate-pulse rounded border border-card bg-card" />
				)}
			</main>
			{panel}
		</>
	);
});
