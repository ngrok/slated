<p align="center">
  <img src="public/icon-512.png" width="88" height="88" alt="The Slated mark: a calendar tile with one day filled in.">
</p>

<h1 align="center">Slated</h1>

<p align="center">
  Everything your team has slated to ship, on one calendar.
</p>

<p align="center">
  <a href="https://github.com/ngrok-adhoc/slated/actions/workflows/ci.yml"><img src="https://github.com/ngrok-adhoc/slated/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

---

Your content plan already lives in [Linear](https://linear.app), with due dates,
labels, and assignees on every issue. For truly inexplicable reasons, Linear
*still* won't let you see all this on a grid.

Like, a content calendar.

Slated is that calendar. It reads your issues from the Linear API, places each
one on the day it's due, and moves it when you drag it. It stores nothing
itself, so Linear remains the only source of truth.

We plan a ton of content at ngrok, and our issues already live in Linear. What
we didn't have was a nice way to see what's coming, or to share it with the rest
of the team. Slated is exactly that, designed around simplicity and performance
from the start.

<p align="center">
  <img src="docs/screenshot.png" alt="The Slated calendar: issue cards on their due dates across a month, one busy day's '+N more' list open with an issue selected, and the side panel showing that issue's status, assignee, priority, due date, project, description, and tags.">
</p>

<!--
  To retake: run `pnpm demo`, open http://localhost:3100 at 1440x900 with a 2x
  device scale, open a busy day's "+N more" list, click an issue in it, and
  capture the window. GitHub shows READMEs about 838px wide, so a wider capture
  only shrinks the text. The demo is anchored on today, so the cards change
  from day to day.
-->

## What you get

**A calendar of your Linear issues.** Every issue sits on its due date and every
project on its target date, both treated as the publish date. Every day is the
same size, so a week reads at a glance: a busy day shows its first cards and a
**+N more** link that opens the whole day. Within a day, projects come first,
then issues from most to least urgent.

**Drag to reschedule.** Drop an issue or project on a new day, including from a
day's **+N more** list. The card moves first, then rolls back if Linear rejects
the write.

**A side panel for everything else.** Click an issue to edit its status,
assignee, priority, due date, project, and description, and to add or remove
tags. Clear the date to drop it off the calendar, with an undo. On a wide screen
the panel is always open, and with no issue selected it shows what's on deck:
what's due today and how much of it is done, the next unfinished issues, and
anything unassigned in the coming week.

**New issues in place.** Hit **+** for one due today, or hover a day and hit its
**+**. Set the title, description, team, due date, status, priority, assignee,
and tags, and the new issue opens in the panel.

**Keyboard friendly.** `J` and `K` step through the issues in calendar order,
opening a busy day's list when the next issue is tucked inside it. `Esc`
closes the panel, and `⌘ Enter` (`Ctrl Enter` off a Mac) saves a description.

**Your teams, your labels.** Slated discovers your teams from Linear. The
**Options** menu filters by team and label, shows or hides weekends, completed
issues, sub-tasks, and projects, and switches the theme.

## Quickstart

You need [Node](https://nodejs.org) 20 or newer,
[pnpm](https://pnpm.io/installation), and a personal Linear API key from
[linear.app/settings/api](https://linear.app/settings/api).

```bash
git clone https://github.com/ngrok-adhoc/slated.git
cd slated
pnpm install
pnpm setup:env    # asks for your API key, writes .env (not `pnpm setup`)
pnpm dev          # http://localhost:3000
```

Reload the page on your first run. Vite optimizes dependencies during that first
load, and the buttons do nothing until it finishes.

One variable, and no OAuth app to register:

```
LINEAR_API_KEY=lin_api_...
```

> [!WARNING]
> **Slated has no access control of its own.** Everyone who reaches the server
> holds your Linear read and write access, and every issue they touch is
> attributed to you. Keep it on `localhost`, or put authentication in front of
> it (see [Deploying](#deploying)).

> [!NOTE]
> **Your workspace may not allow this.** Linear admins control personal API keys
> under **Settings > Administration > API**. If that page won't issue one, ask
> an admin.

### See it without Linear

`pnpm demo` runs the real calendar against a generated workspace: invented
teams, projects, and a few months of content that never shipped.

```bash
pnpm install
pnpm demo         # http://localhost:3100
```

There's no `.env` and no Linear request. Dragging, editing, and creating issues
all work, with edits held in memory until you stop the server. It runs on 3100 so it won't
collide with a real instance on 3000.

It's deterministic and anchored on today: the same day holds the same cards on
every run, and the past always reads as shipped.

## Configuration

Every value goes in `.env` (see [`.env.example`](./.env.example)).

| Variable | Required | What it does |
| --- | --- | --- |
| `LINEAR_API_KEY` | Yes | A personal key from [linear.app/settings/api](https://linear.app/settings/api). Slated acts as its owner, and it stays server-side. |
| `LINEAR_TEAM_DEFAULT` | No | Comma-separated team keys (`GTM,CON`) preselected on a first visit. |
| `LINEAR_LABEL_NAMESPACE` | No | Scopes the calendar to labels under a prefix (`con/`), and strips it in the UI. |
| `LINEAR_PROJECT_LABEL` | No | The project label (`Content`) that decides which projects reach the calendar. Comma-separated for several. |
| `SLATED_DEMO` | No | Set to `1` to serve the demo calendar instead of Linear, with no API key and no Linear request. |

Slated reads these once, at startup, so restart after you change `.env`. A stale
`LINEAR_PROJECT_LABEL` silently empties the calendar of projects. The
**Options** menu names the label it's filtering on, so check there for the value
the server actually holds.

### Adapting it to your workspace

Slated discovers your teams and **fetches nothing until you select one**, so an
empty first load usually means no team is picked. `LINEAR_TEAM_DEFAULT` seeds
that selection, and every team stays available to toggle.

Leave `LINEAR_LABEL_NAMESPACE` blank and labels stay optional filters. Set it to
`con/` and only those labels are offered, with the prefix stripped in the UI and
unfiltered views narrowed to issues carrying one.

Projects filter the same way, first by selected teams and then by
`LINEAR_PROJECT_LABEL`. Project labels are workspace-level in Linear rather than
per-team, so this one is a plain name instead of a prefix. The label filter
under **Options** doesn't touch projects: Linear keeps the two label sets
separate.

## Deploying

Anything other people can reach needs access control in front of it.

A container image ships for every commit on `main`:

```bash
docker run --rm -p 3000:3000 --env-file .env ghcr.io/ngrok-adhoc/slated:latest
```

Pin an exact build with `ghcr.io/ngrok-adhoc/slated:sha-<commit>`, or build it
yourself:

```bash
docker build -t slated .
docker run --rm -p 3000:3000 --env-file .env slated
```

Bind it to `localhost`, or front it with something that authenticates visitors.
Slated serves the calendar to whoever asks.

## How it works

Slated is a [React Router](https://reactrouter.com) app that talks to Linear
from the server. The API key stays in the server's environment and every request
is proxied, so it never reaches the browser. There's no database: the browser
caches what it fetches for the session with
[TanStack Query](https://tanstack.com/query). The UI uses
[mantle](https://mantle.ngrok.com), ngrok's design system.

[`docs/design.md`](./docs/design.md) is the original design doc and build log,
including the performance work behind it. It describes an OAuth flow Slated no
longer has.

## Development

```bash
pnpm dev          # dev server on :3000
pnpm demo         # generated demo calendar on :3100, no API key
pnpm test         # vitest
pnpm typecheck    # react-router typegen + tsc
pnpm lint         # biome
pnpm fmt          # biome, writing fixes
pnpm build        # production build
```

CI runs lint, typecheck, tests, and the build on every pull request.

## Repo layout

```
.
├── app/
│   ├── routes/        The calendar page and the API routes that proxy Linear.
│   ├── features/
│   │   └── calendar/  The month grid, cards, filters, issue panel, and data hooks.
│   └── lib/           Env, the Linear client, the GraphQL queries, and the
│                       demo calendar's fake workspace.
├── scripts/           pnpm setup:env.
├── .github/workflows/ CI and the container image publish.
└── Dockerfile         Multi-stage production build.
```

## Heads up

This is an internal ngrok tool we're sharing as-is. It's shaped around how our
GTM and Content teams work, though it's configurable enough for another Linear
workspace. It isn't a supported product, so we may not take issues or pull
requests. Fork it and make it yours.

## License

[MIT](./LICENSE)
