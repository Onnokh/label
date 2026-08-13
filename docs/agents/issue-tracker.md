# Issue tracker: Linear (via the executor MCP)

Issues and specs for this repo live in **Linear**, not GitHub Issues — the GitHub remote is code hosting only.

All Linear operations go through the **executor MCP** (`execute`), which runs TypeScript against connected integrations. Tool paths live under `tools.linear_mcp.user.personallinearmcp.*`. Do not use a direct Linear MCP server and do not use `gh issue`.

## Coordinates

- **Project**: `Sleevy` — id `0e9e77b4-8e18-41a1-bbe6-8356bf34bf82`, [overview](https://linear.app/plowski-inc/project/sleevy-5bb1f97b76da)
- **Team**: `Plowski Inc.` — id `689975d2-620b-4e69-8d00-0c318699f98c`, key `PLO`
- Every issue for this repo is created on that team **and** attached to that project.

## Conventions

- **Create an issue**: `save_issue({ title, description, team, project, labels })`. Omit `id` to create. The description is Markdown; build it as an array of lines joined with `\n` rather than a template literal, so inline code backticks survive.
- **Update an issue**: `save_issue({ id: "PLO-424", ... })`. For a small edit to a long description, prefer `patch` (`replace`, `insert_after`, `append`, …) over resending the whole body.
- **Read an issue**: `get_issue({ query: "PLO-424" })`, then `list_comments({ issueId })` for the conversation.
- **List issues**: `list_issues({ project, state, label, limit, fields })`. Pass `fields` to keep responses small, and filter in code rather than calling `get_issue` per row.
- **Comment**: `save_comment({ issueId, body })`.
- **Labels**: pass `labels: [...]` to `save_issue` — the array replaces the current set. `list_issue_labels({})` first; create with `create_issue_label` only when the label genuinely does not exist.
- **Change state**: `save_issue({ id, state: "In Progress" })`. Team states are `Backlog`, `Todo`, `In Progress`, `Ready for Review`, `Ready for Merge`, `Done`, `Canceled`.
- **Close**: set `state` to `Done` (or `Canceled`), after commenting the outcome.
- **Assign**: `save_issue({ id, assignee })`.
- **Link a spec to code**: `save_issue` returns `gitBranchName` — use it as the branch name so Linear links the branch automatically.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `Plowski Inc.` in project `Sleevy`, and apply the triage label the skill asks for.

## When a skill says "fetch the relevant ticket"

`get_issue({ query: "<PLO-nnn>" })` plus `list_comments`. The user normally passes the identifier or the issue URL.

## Triage labels

The five canonical roles use the default strings. `ready-for-agent` and `human-in-the-loop` already exist on the team; create the others only when first needed.

## Pull requests as a triage surface

**PRs as a request surface: no.** GitHub PRs are not part of the triage queue. Set this to `yes` only if external PRs start arriving and should be triaged alongside Linear issues.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue; each ticket is a Linear sub-issue of it.

- **Map**: an issue labelled `wayfinder:map` holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `save_issue({ parentId: <map id>, labels: ["wayfinder:<type>"] })`, where the type is `research`, `prototype`, `grilling`, or `task`. All four labels already exist on the team.
- **Blocking**: native Linear relations — `save_issue({ id: <child>, blockedBy: [<blocker>] })`. A ticket is unblocked when every blocker reached `Done` or `Canceled`.
- **Frontier query**: `list_issues({ parentId: <map id> })`, drop anything already `Done`/`Canceled`, anything with an unfinished blocker, and anything already assigned; first in map order wins.
- **Claim**: assign the issue to the driving dev and set `state` to `In Progress` — the session's first write.
- **Resolve**: `save_comment` with the answer, set `state` to `Done`, then append a context pointer (gist plus link) to the map's Decisions-so-far.
