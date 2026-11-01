import { eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import type {
	CalendarIssue,
	CalendarProject,
	LabelOption,
	TeamMember,
	TeamOption,
	WorkflowState,
} from "~/features/calendar/types";

/**
 * The demo calendar: a fake Linear workspace, generated on the server, so the
 * grid can be seen (and screenshotted) with no API key and no real content
 * plan. Turned on with SLATED_DEMO=1; `pnpm demo` sets it for you.
 *
 * Two properties matter, and everything here follows from them.
 *
 * 1. It is deterministic. Every issue is derived from its month and its
 *    template, never from Math.random(), so the same day holds the same cards
 *    on every request. Month grids overlap at their edges (the June grid runs
 *    to early July), and two overlapping requests have to agree or cards would
 *    flicker between months.
 * 2. It is anchored on today. Statuses are picked relative to the current date,
 *    so past days read as shipped and future days as planned however long from
 *    now the demo runs.
 */

const ORGANIZATION = { name: "Hello World" };
const VIEWER = { name: "Ada Lovelace", email: "ada@example.com" };

// A month takes a rolling slice of ISSUE_TEMPLATES, so ISSUES_PER_MONTH has to
// divide the pool into at least three disjoint slices. A month grid runs from
// late in the previous month into early in the next, which puts three months on
// screen at once, and a title repeated inside one screenful reads as a bug.
const ISSUES_PER_MONTH = 22;
// The templates are written in team order, so a month that took a contiguous
// slice of them would be all Docs one month and all Growth the next. Walking
// the pool in steps of TEMPLATE_STRIDE mixes the teams across every month.
// It has to stay coprime with the pool size, which is what keeps each month's
// slice a bijection of a contiguous run, and so keeps the three months on
// screen disjoint.
const TEMPLATE_STRIDE = 7;
const PROJECTS_PER_MONTH = 2;

const TEAMS: TeamOption[] = [
	{ id: "team-con", key: "CON", name: "Content" },
	{ id: "team-dev", key: "DEV", name: "Developer Relations" },
	{ id: "team-gtm", key: "GTM", name: "Growth Marketing" },
	{ id: "team-doc", key: "DOC", name: "Docs" },
];

const LABELS = [
	{ name: "blog", color: "#5e6ad2" },
	{ name: "docs", color: "#26b5ce" },
	{ name: "video", color: "#eb5757" },
	{ name: "newsletter", color: "#f2994a" },
	{ name: "launch", color: "#4cb782" },
	{ name: "social", color: "#bb87fc" },
	{ name: "talk", color: "#f2c94c" },
	{ name: "community", color: "#00b8cc" },
];

// Linear's five workflow-state categories, named the way a content team would.
const STATES: WorkflowState[] = [
	{ id: "state-backlog", name: "Backlog", color: "#bec2c8", type: "backlog", position: 0 },
	{ id: "state-todo", name: "Todo", color: "#8a8f98", type: "unstarted", position: 1 },
	{ id: "state-drafting", name: "Drafting", color: "#f2c94c", type: "started", position: 2 },
	{ id: "state-review", name: "In review", color: "#26b5ce", type: "started", position: 3 },
	{ id: "state-shipped", name: "Shipped", color: "#4cb782", type: "completed", position: 4 },
	{ id: "state-canceled", name: "Canceled", color: "#95a2b3", type: "cancelled", position: 5 },
];

const PEOPLE: TeamMember[] = [
	{ id: "user-ada", name: "Ada Lovelace", displayName: "Ada Lovelace", avatarUrl: null },
	{ id: "user-grace", name: "Grace Hopper", displayName: "Grace Hopper", avatarUrl: null },
	{ id: "user-alan", name: "Alan Turing", displayName: "Alan Turing", avatarUrl: null },
	{ id: "user-barbara", name: "Barbara Liskov", displayName: "Barbara Liskov", avatarUrl: null },
	{ id: "user-ken", name: "Ken Thompson", displayName: "Ken Thompson", avatarUrl: null },
	{ id: "user-bot", name: "Deploy Bot", displayName: "Deploy Bot", avatarUrl: null },
];

const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];

type ProjectTemplate = {
	name: string;
	color: string;
	/** Team keys the project spans. */
	teams: string[];
	label: { name: string; color: string };
};

const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		name: "Launch Week",
		color: "#5e6ad2",
		teams: ["CON", "GTM"],
		label: { name: "Campaign", color: "#5e6ad2" },
	},
	{
		name: "The Great Rebrand",
		color: "#eb5757",
		teams: ["GTM"],
		label: { name: "Campaign", color: "#5e6ad2" },
	},
	{
		name: "Docs Overhaul",
		color: "#26b5ce",
		teams: ["DOC"],
		label: { name: "Editorial", color: "#4cb782" },
	},
	{
		name: "Conference Season",
		color: "#f2994a",
		teams: ["DEV"],
		label: { name: "Campaign", color: "#5e6ad2" },
	},
	{
		name: "The Newsletter Relaunch",
		color: "#bb87fc",
		teams: ["GTM", "CON"],
		label: { name: "Editorial", color: "#4cb782" },
	},
	{
		name: "Developer Survey",
		color: "#f2c94c",
		teams: ["DEV", "GTM"],
		label: { name: "Research", color: "#f2994a" },
	},
	{
		name: "Q4 SEO Push",
		color: "#4cb782",
		teams: ["GTM"],
		label: { name: "Campaign", color: "#5e6ad2" },
	},
	{
		name: "Migrate to the Other CMS",
		color: "#95a2b3",
		teams: ["CON", "DOC"],
		label: { name: "Editorial", color: "#4cb782" },
	},
];

type IssueTemplate = {
	title: string;
	/** Team key. */
	team: string;
	labels: string[];
	/** Project name, matched against PROJECT_TEMPLATES. */
	project?: string;
	/** Fixed priority, for the few whose joke depends on one. */
	priority?: number;
};

const ISSUE_TEMPLATES: IssueTemplate[] = [
	// Content
	{ title: "Blog: why we moved from microservices to a monolith", team: "CON", labels: ["blog"] },
	{ title: "Blog: why we moved from a monolith to microservices", team: "CON", labels: ["blog"] },
	{ title: "Blog: how we cut the build by four seconds", team: "CON", labels: ["blog"] },
	{ title: "Blog: naming things, part two of one", team: "CON", labels: ["blog"] },
	{ title: "Blog: our stack in 2026 (same as 2019)", team: "CON", labels: ["blog"] },
	{ title: "Blog: the post-mortem nobody asked for", team: "CON", labels: ["blog"] },
	{ title: "Blog: ten tools we quietly stopped using", team: "CON", labels: ["blog"] },
	{ title: "Blog: is it dead? (it is not dead)", team: "CON", labels: ["blog"] },
	{ title: "Blog: an honest changelog", team: "CON", labels: ["blog"] },
	{ title: "Blog: the roadmap we will not follow", team: "CON", labels: ["blog"] },
	{ title: "Ghostwrite the CEO's LinkedIn post", team: "CON", labels: ["social"] },
	{ title: "Interview the engineer who says it depends", team: "CON", labels: ["video"] },
	{ title: "Case study: they turned it off and on again", team: "CON", labels: ["blog"] },
	{ title: "Podcast: episode one of one", team: "CON", labels: ["video"] },
	{ title: "Blog: a year in review, published in March", team: "CON", labels: ["blog"] },
	{
		title: "Screenshot the dashboard before the redesign",
		team: "CON",
		labels: ["social"],
		project: "The Great Rebrand",
	},
	{
		title: "Relaunch issue: same list, new template",
		team: "CON",
		labels: ["newsletter"],
		project: "The Newsletter Relaunch",
	},

	// Developer Relations
	{ title: "Video: five npm packages that are just left-pad", team: "DEV", labels: ["video"] },
	{ title: "Livestream: 90 minutes of YAML indentation", team: "DEV", labels: ["video"] },
	{ title: "Record the demo, take 47", team: "DEV", labels: ["video"] },
	{ title: "Video: the 45-second cut of the 40-minute talk", team: "DEV", labels: ["video"] },
	{ title: "YouTube short that is only the terminal", team: "DEV", labels: ["video", "social"] },
	{ title: "Conference talk: It Depends", team: "DEV", labels: ["talk"] },
	{
		title: "Submit the CFP we will not get accepted for",
		team: "DEV",
		labels: ["talk"],
		project: "Conference Season",
	},
	{
		title: "Keynote: the slide with 40 logos",
		team: "DEV",
		labels: ["talk"],
		project: "Conference Season",
	},
	{
		title: "Booth duty: hand out 400 stickers",
		team: "DEV",
		labels: ["talk"],
		project: "Conference Season",
	},
	{ title: "Meetup talk for eleven people and a pizza", team: "DEV", labels: ["talk"] },
	{ title: "Video: unboxing our own swag", team: "DEV", labels: ["video"] },
	{ title: "AMA where we answer three of forty questions", team: "DEV", labels: ["community"] },
	{ title: "Kill the Discord community no one posts in", team: "DEV", labels: ["community"] },
	{ title: "Launch the community forum, again", team: "DEV", labels: ["community"] },
	{ title: "Answer the Reddit thread from 2021", team: "DEV", labels: ["community"] },
	{
		title: "Reply to the Hacker News thread (do not reply)",
		team: "DEV",
		labels: ["community", "social"],
	},
	{
		title: "Tutorial: expose localhost without crying",
		team: "DEV",
		labels: ["docs", "video"],
		project: "Docs Overhaul",
	},
	{
		title: "Survey results: 61% of us fear the build",
		team: "DEV",
		labels: ["blog"],
		project: "Developer Survey",
	},

	// Growth Marketing
	{ title: "Webinar: the one no one will watch", team: "GTM", labels: ["talk"] },
	{ title: "Webinar: yes, it is still in beta", team: "GTM", labels: ["talk"] },
	{
		title: "Newsletter: the works-on-my-machine issue",
		team: "GTM",
		labels: ["newsletter"],
		project: "The Newsletter Relaunch",
	},
	{ title: "Newsletter: unsubscribe rate is a metric too", team: "GTM", labels: ["newsletter"] },
	{
		title: "Newsletter: forward this to a friend (nobody will)",
		team: "GTM",
		labels: ["newsletter"],
	},
	{ title: "Sponsor the newsletter that sponsors us", team: "GTM", labels: ["newsletter"] },
	{
		title: "Newsletter: an apology for last week's newsletter",
		team: "GTM",
		labels: ["newsletter"],
	},
	{
		title: "Landing page copy, version 11",
		team: "GTM",
		labels: ["launch"],
		project: "The Great Rebrand",
	},
	{
		title: "SEO page for how to exit vim",
		team: "GTM",
		labels: ["blog"],
		project: "Q4 SEO Push",
	},
	{
		title: "Comparison page where we win every row",
		team: "GTM",
		labels: ["blog"],
		project: "Q4 SEO Push",
	},
	{
		title: "Landing page: AI-powered (it is a regex)",
		team: "GTM",
		labels: ["launch"],
		project: "The Great Rebrand",
	},
	{
		title: "Announce the thing we announced last quarter",
		team: "GTM",
		labels: ["launch", "social"],
		project: "Launch Week",
	},
	{ title: "Sunset the sunset announcement", team: "GTM", labels: ["launch"] },
	{
		title: "Rename the product (third attempt)",
		team: "GTM",
		labels: ["launch"],
		project: "The Great Rebrand",
	},
	{ title: "Publish it before the all-hands", team: "GTM", labels: ["launch"], priority: 2 },
	{
		title: "Fix the typo in the headline (it is live)",
		team: "GTM",
		labels: ["social"],
		priority: 1,
	},
	{ title: "Draft the tweet. Delete the tweet. Draft the tweet.", team: "GTM", labels: ["social"] },
	{ title: "Schedule 30 posts, ship three", team: "GTM", labels: ["social"] },
	{ title: "Post the benchmark that makes us look good", team: "GTM", labels: ["social", "blog"] },

	// Docs
	{ title: "Docs: what that error code actually means", team: "DOC", labels: ["docs"] },
	{
		title: "Docs: the migration guide for the migration guide",
		team: "DOC",
		labels: ["docs"],
		project: "Migrate to the Other CMS",
	},
	{
		title: "Docs: the quickstart nobody finishes",
		team: "DOC",
		labels: ["docs"],
		project: "Docs Overhaul",
	},
	{ title: "Guide: read a stack trace without panicking", team: "DOC", labels: ["docs"] },
	{
		title: "Turn the 900-word README into 9,000 words",
		team: "DOC",
		labels: ["docs"],
		project: "Docs Overhaul",
	},
	{ title: "Write the FAQ nobody asks", team: "DOC", labels: ["docs"] },
	{ title: "Docs: the glossary nobody links to", team: "DOC", labels: ["docs"] },
	{ title: "Docs sprint to fix the last docs sprint", team: "DOC", labels: ["docs"] },
	{ title: "Changelog for the changelog tool", team: "DOC", labels: ["docs"] },
	{ title: "Deprecate the deprecation notice", team: "DOC", labels: ["docs"] },
	{ title: "Rewrite the README in the voice of a pirate", team: "DOC", labels: ["docs"] },
	{
		title: "Migrate the wiki to the other wiki",
		team: "DOC",
		labels: ["docs"],
		project: "Migrate to the Other CMS",
	},
];

const DESCRIPTIONS = [
	"Draft is in the doc. Two people have commented 'nit'.",
	"Blocked on a screenshot that shows the feature working.",
	"Scoped down twice already. Scoping down again.",
	"Publish Friday. Nothing has ever gone wrong on a Friday.",
	"Legal read it and asked what a container is.",
	"Waiting on a quote from someone who is on PTO.",
	"The outline is four bullets and one of them says 'TBD'.",
	"Reviewed, approved, and then rewritten by the reviewer.",
	"SEO wants the keyword in the H1. The H1 is a joke.",
	"Design has the hero image. Design is at an offsite.",
	"Embargo lifts at 9am. The draft is at 60%.",
	"The demo works. The recording of the demo does not.",
];

// --- deterministic randomness ---------------------------------------------

/** FNV-1a, so a string seeds the generator the same way on every request. */
function hash(value: string): number {
	let h = 2166136261;
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** mulberry32: small, fast, and good enough to scatter cards across a month. */
function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(items: readonly T[], roll: number): T {
	const item = items[Math.min(items.length - 1, Math.floor(roll * items.length))];
	if (!item) {
		throw new Error("demo: cannot pick from an empty list");
	}
	return item;
}

// --- lookups ---------------------------------------------------------------

function teamByKey(key: string): TeamOption {
	const team = TEAMS.find((candidate) => candidate.key === key);
	if (!team) {
		throw new Error(`demo: unknown team key ${key}`);
	}
	return team;
}

/** Issue labels are per-team in Linear, so the id carries the team. */
function labelId(name: string, teamId: string): string {
	return `label-${name}-${teamId}`;
}

function labelsFor(names: string[], teamId: string) {
	return names.flatMap((name) => {
		const label = LABELS.find((candidate) => candidate.name === name);
		return label ? [{ id: labelId(name, teamId), name, color: label.color }] : [];
	});
}

function stateById(id: string): WorkflowState | undefined {
	return STATES.find((state) => state.id === id);
}

function stateFor(name: string): WorkflowState {
	const state = STATES.find((candidate) => candidate.name === name);
	if (!state) {
		throw new Error(`demo: unknown state ${name}`);
	}
	return state;
}

function asIssueState(state: WorkflowState): CalendarIssue["state"] {
	return { id: state.id, name: state.name, color: state.color, type: state.type };
}

/**
 * A status that suits where the day sits relative to today: shipped behind us,
 * in flight around now, planned ahead. It is what makes the grid read like a
 * calendar somebody actually works from.
 */
function statusForDay(dayOffset: number, roll: number): WorkflowState {
	if (dayOffset < -1) {
		return stateFor(roll < 0.82 ? "Shipped" : roll < 0.92 ? "Canceled" : "In review");
	}
	if (dayOffset <= 1) {
		return stateFor(roll < 0.5 ? "Drafting" : roll < 0.85 ? "In review" : "Shipped");
	}
	return stateFor(roll < 0.45 ? "Todo" : roll < 0.75 ? "Backlog" : "Drafting");
}

function priorityFor(roll: number): number {
	if (roll < 0.34) {
		return 0;
	}
	if (roll < 0.64) {
		return 3;
	}
	if (roll < 0.82) {
		return 4;
	}
	if (roll < 0.95) {
		return 2;
	}
	return 1;
}

// --- generation ------------------------------------------------------------

/** Months are addressed by a single integer so an issue id can carry one. */
function monthIndexOf(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

function monthFromIndex(index: number): Date {
	return new Date(Math.floor(index / 12), index % 12, 1);
}

function weekdaysOfMonth(month: Date): Date[] {
	return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }).filter(
		(day) => day.getDay() !== 0 && day.getDay() !== 6,
	);
}

function daysFromToday(date: Date, today: Date): number {
	const oneDay = 24 * 60 * 60 * 1000;
	const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
	const to = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	return Math.round((to - from) / oneDay);
}

function projectSummary(name: string): CalendarIssue["project"] {
	const template = PROJECT_TEMPLATES.find((candidate) => candidate.name === name);
	if (!template) {
		return null;
	}
	return {
		id: `demo-project-${name}`,
		name,
		url: `https://linear.app/slated-demo/project/${encodeURIComponent(name)}`,
	};
}

/**
 * Every issue for one month. The month picks a rolling slice of the templates,
 * so neighbouring months hold different work, and each template lands on a
 * weekday chosen by its own seed. Several templates can share a day; that is
 * what gives some days three cards and others none.
 */
function issuesForMonth(month: Date): CalendarIssue[] {
	const monthIndex = monthIndexOf(month);
	const weekdays = weekdaysOfMonth(month);
	const today = new Date();
	const issues: CalendarIssue[] = [];

	for (let slot = 0; slot < ISSUES_PER_MONTH; slot++) {
		const templateIndex =
			(monthIndex * ISSUES_PER_MONTH + slot * TEMPLATE_STRIDE) % ISSUE_TEMPLATES.length;
		const template = ISSUE_TEMPLATES[templateIndex];
		if (!template) {
			continue;
		}
		const random = seeded(hash(`issue:${monthIndex}:${templateIndex}`));
		const day = pick(weekdays, random());
		const team = teamByKey(template.team);
		const state = statusForDay(daysFromToday(day, today), random());
		const assigneeRoll = random();
		const identifier = `${team.key}-${100 + (hash(`id:${monthIndex}:${templateIndex}`) % 800)}`;

		issues.push({
			id: `demo-issue-${monthIndex}-${templateIndex}`,
			identifier,
			title: template.title,
			dueDate: format(day, "yyyy-MM-dd"),
			url: `https://linear.app/slated-demo/issue/${identifier}`,
			priority: template.priority ?? priorityFor(random()),
			priorityLabel: "",
			state: asIssueState(state),
			assignee: assigneeRoll < 0.86 ? pick(PEOPLE, assigneeRoll / 0.86) : null,
			labels: labelsFor(template.labels, team.id),
			project: template.project ? projectSummary(template.project) : null,
			team: { id: team.id, key: team.key, name: team.name },
			// A handful of sub-tasks, so Options > Show sub-tasks has something to
			// hide.
			parent: random() < 0.12 ? { id: `demo-parent-${monthIndex}` } : null,
		});
	}

	for (const issue of issues) {
		issue.priorityLabel = PRIORITY_LABELS[issue.priority] ?? "No priority";
	}
	return issues;
}

/**
 * Two projects a month, landing in the back half where a target date usually
 * falls. The pool is walked two at a time, so no month repeats its neighbour.
 */
function projectsForMonth(month: Date): CalendarProject[] {
	const monthIndex = monthIndexOf(month);
	const weekdays = weekdaysOfMonth(month);
	// Each project takes its own slice of the month, so two never stack on one
	// day and a screenful shows projects at different stages.
	const sliceSize = Math.max(1, Math.floor(weekdays.length / PROJECTS_PER_MONTH));
	const today = new Date();
	const projects: CalendarProject[] = [];

	for (let slot = 0; slot < PROJECTS_PER_MONTH; slot++) {
		const templateIndex = (monthIndex * PROJECTS_PER_MONTH + slot) % PROJECT_TEMPLATES.length;
		const template = PROJECT_TEMPLATES[templateIndex];
		if (!template) {
			continue;
		}
		const random = seeded(hash(`project:${monthIndex}:${templateIndex}`));
		const slice = weekdays.slice(slot * sliceSize, (slot + 1) * sliceSize);
		const day = pick(slice.length > 0 ? slice : weekdays, random());
		const offset = daysFromToday(day, today);
		const status =
			offset < -1
				? { name: "Completed", type: "completed", color: "#4cb782" }
				: offset <= 7
					? { name: "In progress", type: "started", color: "#f2c94c" }
					: { name: "Planned", type: "backlog", color: "#bec2c8" };
		// Progress has to agree with the status, or a "Planned" project shows up
		// 40% done.
		const progress =
			status.type === "completed"
				? 1
				: status.type === "started"
					? 0.3 + Math.round(random() * 5) / 10
					: Math.round(random() * 2) / 10;
		const leadRoll = random();

		projects.push({
			id: `demo-project-${template.name}`,
			name: template.name,
			url: `https://linear.app/slated-demo/project/${encodeURIComponent(template.name)}`,
			targetDate: format(day, "yyyy-MM-dd"),
			// One in four is a coarse Linear period, so the card's "approx." note
			// shows up in the demo the way it does in a real workspace.
			targetDateResolution: random() < 0.25 ? "month" : null,
			color: template.color,
			progress: Math.min(1, progress),
			status: { id: `project-status-${status.name}`, ...status },
			lead: leadRoll < 0.9 ? pick(PEOPLE, leadRoll / 0.9) : null,
			labels: [
				{
					id: `project-label-${template.label.name}`,
					name: template.label.name,
					color: template.label.color,
				},
			],
			teams: template.teams.map((key) => {
				const team = teamByKey(key);
				return { id: team.id, key: team.key, name: team.name };
			}),
		});
	}
	return projects;
}

function monthsBetween(start: string, end: string): Date[] {
	const months: Date[] = [];
	const last = monthIndexOf(parseISO(end));
	for (let index = monthIndexOf(parseISO(start)); index <= last; index++) {
		months.push(monthFromIndex(index));
	}
	return months;
}

// --- edits -----------------------------------------------------------------

/**
 * Edits made in the demo, held in memory for the life of the process. Without
 * these a dragged card would snap back on the next refetch, and the calendar's
 * whole point is that you can move things. They are lost on restart, which is
 * the right amount of durability for a demo.
 */
type IssueEdit = {
	dueDate?: string | null;
	stateId?: string;
	labelIds?: string[];
	/** null unassigns. */
	assigneeId?: string | null;
	priority?: number;
	/** null removes the issue from its project. */
	projectId?: string | null;
	description?: string;
};

const issueEdits = new Map<string, IssueEdit>();
const projectEdits = new Map<string, string | null>();
const createdIssues: CalendarIssue[] = [];

function applyIssueEdit(issue: CalendarIssue): CalendarIssue | null {
	const edit = issueEdits.get(issue.id);
	if (!edit) {
		return issue;
	}
	if (edit.dueDate === null) {
		return null;
	}
	const state = edit.stateId ? stateById(edit.stateId) : undefined;
	return {
		...issue,
		...(edit.dueDate ? { dueDate: edit.dueDate } : {}),
		...(state ? { state: asIssueState(state) } : {}),
		...(edit.assigneeId !== undefined
			? { assignee: PEOPLE.find((person) => person.id === edit.assigneeId) ?? null }
			: {}),
		...(edit.priority !== undefined
			? {
					priority: edit.priority,
					priorityLabel: PRIORITY_LABELS[edit.priority] ?? "No priority",
				}
			: {}),
		...(edit.projectId !== undefined
			? {
					project: edit.projectId
						? projectSummary(edit.projectId.replace(/^demo-project-/, ""))
						: null,
				}
			: {}),
		...(edit.labelIds
			? {
					labels: edit.labelIds.flatMap((id) => {
						const label = LABELS.find((candidate) => id.startsWith(`label-${candidate.name}-`));
						return label ? [{ id, name: label.name, color: label.color }] : [];
					}),
				}
			: {}),
	};
}

/** Rebuild one issue from its id, for edits that moved it out of its month. */
function issueById(id: string): CalendarIssue | null {
	const created = createdIssues.find((issue) => issue.id === id);
	if (created) {
		return created;
	}
	const parts = /^demo-issue-(\d+)-(\d+)$/.exec(id);
	if (!parts?.[1]) {
		return null;
	}
	const month = monthFromIndex(Number(parts[1]));
	return issuesForMonth(month).find((issue) => issue.id === id) ?? null;
}

function projectById(id: string): CalendarProject | null {
	const name = id.replace(/^demo-project-/, "");
	const template = PROJECT_TEMPLATES.find((candidate) => candidate.name === name);
	if (!template) {
		return null;
	}
	const index = PROJECT_TEMPLATES.indexOf(template);
	// The project sits in whichever month the pool walk placed it; find the
	// month that owns it by scanning the months around today.
	const base = monthIndexOf(new Date());
	for (let offset = -12; offset <= 12; offset++) {
		const monthIndex = base + offset;
		if ((monthIndex * PROJECTS_PER_MONTH) % PROJECT_TEMPLATES.length === index) {
			return projectsForMonth(monthFromIndex(monthIndex))[0] ?? null;
		}
		if ((monthIndex * PROJECTS_PER_MONTH + 1) % PROJECT_TEMPLATES.length === index) {
			return projectsForMonth(monthFromIndex(monthIndex))[1] ?? null;
		}
	}
	return null;
}

// --- the API the routes call ----------------------------------------------

export function demoSession() {
	return { viewer: VIEWER, organization: ORGANIZATION };
}

export function demoTeams(): { teams: TeamOption[]; defaultTeamIds: string[] } {
	// Every team is preselected: a demo that opens on an empty grid demos
	// nothing.
	return { teams: TEAMS, defaultTeamIds: TEAMS.map((team) => team.id) };
}

export function demoLabels(): { labels: LabelOption[]; requiresLabelMatch: boolean } {
	const labels: LabelOption[] = LABELS.map((label) => ({
		name: label.name,
		color: label.color,
		matchesNamespace: false,
		ids: TEAMS.map((team) => labelId(label.name, team.id)),
		idByTeam: Object.fromEntries(TEAMS.map((team) => [team.id, labelId(label.name, team.id)])),
		globalIds: [],
	}));
	return { labels, requiresLabelMatch: false };
}

export function demoStates(): WorkflowState[] {
	return STATES;
}

export function demoMembers(): TeamMember[] {
	return PEOPLE;
}

export function demoTeamProjects(teamId: string): NonNullable<CalendarIssue["project"]>[] {
	const key = TEAMS.find((team) => team.id === teamId)?.key;
	return PROJECT_TEMPLATES.filter((template) => key && template.teams.includes(key)).flatMap(
		(template) => projectSummary(template.name) ?? [],
	);
}

export function demoIssues(params: {
	start: string;
	end: string;
	teamIds: string[];
	labelIds: string[];
}): CalendarIssue[] {
	const generated = monthsBetween(params.start, params.end).flatMap(issuesForMonth);
	const seen = new Set(generated.map((issue) => issue.id));
	const candidates = [...generated, ...createdIssues.filter((issue) => !seen.has(issue.id))];
	// An edit can have moved an issue in from a month outside this window.
	for (const id of issueEdits.keys()) {
		if (!seen.has(id) && !candidates.some((issue) => issue.id === id)) {
			const issue = issueById(id);
			if (issue) {
				candidates.push(issue);
			}
		}
	}

	const teams = new Set(params.teamIds);
	const labels = new Set(params.labelIds);
	return candidates.flatMap((candidate) => {
		const issue = applyIssueEdit(candidate);
		if (!issue || issue.dueDate < params.start || issue.dueDate > params.end) {
			return [];
		}
		if (!teams.has(issue.team.id)) {
			return [];
		}
		if (labels.size > 0 && !issue.labels.some((label) => labels.has(label.id))) {
			return [];
		}
		return [issue];
	});
}

export function demoProjects(params: {
	start: string;
	end: string;
	teamIds: string[];
}): CalendarProject[] {
	const generated = monthsBetween(params.start, params.end).flatMap(projectsForMonth);
	const candidates = [...generated];
	for (const id of projectEdits.keys()) {
		if (!candidates.some((project) => project.id === id)) {
			const project = projectById(id);
			if (project) {
				candidates.push(project);
			}
		}
	}

	const teams = new Set(params.teamIds);
	return candidates.flatMap((candidate) => {
		const edited = projectEdits.get(candidate.id);
		if (edited === null) {
			return [];
		}
		const project = edited
			? { ...candidate, targetDate: edited, targetDateResolution: null }
			: candidate;
		if (project.targetDate < params.start || project.targetDate > params.end) {
			return [];
		}
		if (!project.teams.some((team) => teams.has(team.id))) {
			return [];
		}
		return [project];
	});
}

export function demoIssueDetail(id: string): { description: string | null } {
	const issue = issueById(id);
	if (!issue) {
		return { description: null };
	}
	const edited = issueEdits.get(id)?.description;
	if (edited !== undefined) {
		return { description: edited || null };
	}
	return { description: pick(DESCRIPTIONS, seeded(hash(`description:${id}`))()) };
}

export function demoUpdateIssue(input: {
	issueId: string;
	dueDate?: string | null;
	stateId?: string;
	labelIds?: string[];
	assigneeId?: string | null;
	priority?: number;
	projectId?: string | null;
	description?: string;
}): void {
	const existing = issueEdits.get(input.issueId) ?? {};
	issueEdits.set(input.issueId, {
		...existing,
		...("dueDate" in input ? { dueDate: input.dueDate } : {}),
		...(input.stateId ? { stateId: input.stateId } : {}),
		...(input.labelIds ? { labelIds: input.labelIds } : {}),
		...("assigneeId" in input ? { assigneeId: input.assigneeId } : {}),
		...(input.priority !== undefined ? { priority: input.priority } : {}),
		...("projectId" in input ? { projectId: input.projectId } : {}),
		...(input.description !== undefined ? { description: input.description } : {}),
	});
}

export function demoUpdateProject(projectId: string, targetDate: string | null): void {
	projectEdits.set(projectId, targetDate);
}

export function demoCreateIssue(input: {
	teamId: string;
	title: string;
	dueDate?: string;
	labelIds?: string[];
	stateId?: string;
	priority?: number;
	assigneeId?: string;
}): CalendarIssue {
	const team = TEAMS.find((candidate) => candidate.id === input.teamId) ?? TEAMS[0];
	if (!team) {
		throw new Error("demo: no teams configured");
	}
	const number = 900 + createdIssues.length;
	const identifier = `${team.key}-${number}`;
	const state = (input.stateId ? stateById(input.stateId) : undefined) ?? stateFor("Todo");
	const priority = input.priority ?? 0;
	const issue: CalendarIssue = {
		id: `demo-issue-created-${number}`,
		identifier,
		title: input.title,
		dueDate: input.dueDate ?? format(new Date(), "yyyy-MM-dd"),
		url: `https://linear.app/slated-demo/issue/${identifier}`,
		priority,
		priorityLabel: PRIORITY_LABELS[priority] ?? "No priority",
		state: asIssueState(state),
		assignee: PEOPLE.find((person) => person.id === input.assigneeId) ?? null,
		labels: (input.labelIds ?? []).flatMap((id) => {
			const label = LABELS.find((candidate) => id.startsWith(`label-${candidate.name}-`));
			return label ? [{ id, name: label.name, color: label.color }] : [];
		}),
		project: null,
		team: { id: team.id, key: team.key, name: team.name },
		parent: null,
	};
	createdIssues.push(issue);
	return issue;
}
