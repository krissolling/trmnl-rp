# TRMNL · Figma Week

An e-ink dashboard plugin for Regular Practice's TRMNL device. Shows the agency's
Figma activity for the current week — projects touched, files touched, new files
created, named versions saved, and comment volume — with last week's totals as
the reference for "how are we tracking."

Designed for in-office viewing only (Tue/Wed/Thu). The counter climbs invisibly
on Monday and Friday when the team is WFH, so the first office view on Tuesday
morning already has real numbers on the board.

## Layout

```
trmnl-rp/
├── api/              Node backend — aggregates Figma data into JSON
├── starter/          trmnlp plugin (Liquid templates, local preview)
├── playground/       Standalone HTML mockup for design exploration
└── README.md
```

## Run it locally

Two processes — API backend, then trmnlp preview.

### 1. API backend

```sh
cd api
cp .env.example .env        # leave FIGMA_TOKEN blank for now → mock mode
npm run dev
```

Serves `http://localhost:3000/api/figma-week` with mock data shaped exactly
like production. Override the mocked weekday with `MOCK_DAY=tue|wed|thu` to see
different points in the week without waiting for calendar time.

### 2. trmnlp preview

In a second terminal:

```sh
cd starter
bundle install              # once
trmnlp serve                # or ./bin/serve for docker
```

Open `http://127.0.0.1:4567/` — all four layouts render in one page, live-reloading
as you edit `views/*.liquid`.

## Production

Deployed via **Coolify** on the Hetzner VPS — auto-builds on push to `main`.

- Live URL: `https://figma-week.rgpr.app/api/figma-week`
- Fonts: `https://figma-week.rgpr.app/Antarctica-*.woff2`
- TRMNL polling URL points here.

Coolify app: name `trmnl-rp` → Base Directory `/api` → Dockerfile build pack →
port 3000 → domain `https://figma-week.rgpr.app` → persistent volume mounted at
`/app/data` (cache survives redeploys).

Environment variables (set in Coolify):
- `FIGMA_TOKEN` — Figma personal access token
- `FIGMA_TEAM_ID` — numeric team ID
- `PORT` — 3000

### Cache warming

First cold boot does a serial 185-project scan (~1 min) to populate the cache.
Subsequent polls are instant. Warm manually after a deploy-with-empty-volume:

```sh
ssh root@78.47.187.84 "docker exec \$(docker ps --filter name=x4048goksw4cwss4ckkk0gww -q) node scripts/warm.js"
```

### Figma token rotation ⚠️

The Figma PAT expires **every 90 days** (Figma no longer issues never-expire tokens).

**Current token issued:** 2026-04-24. **Next rotation due:** ~2026-07-23.

Rotation procedure:
1. Figma → avatar → Settings → Security → Personal access tokens → Generate new
2. Scopes: `file_content:read`, `file_metadata:read`, `file_versions:read`, `file_comments:read`, `projects:read`
3. In Coolify: Site → Environment variables → replace `FIGMA_TOKEN` value → **Redeploy**
4. Revoke the old token in Figma

## JSON contract

The API returns this shape; the Liquid templates consume it directly.

```json
{
  "view": "live",
  "label": "Wed 22 Apr · week in progress",
  "day_short": "Wed",
  "progress": 3,
  "is_live": true,
  "generated_at": "2026-04-22T09:00:00.000Z",
  "cur":    { "projects": 5, "files": 19, "new_files": 5, "versions": 11, "comments": 34 },
  "ref":    { "kind": "lastwk", "projects": 7, "files": 34, "new_files": 9, "versions": 21, "comments": 63 },
  "trends": {
    "projects": "last wk · 7",
    "files": "last wk · 34",
    "new_files": "last wk · 9",
    "versions": "last wk · 21",
    "comments_line": "34 comments · last wk 63"
  }
}
```

`progress` is 1–5 (Mon–Fri, weekend clamped to 5). Pre-rendered trend strings
live in `trends.*` so the Liquid templates don't need conditional logic for the
reference line.

## Design decisions

See the playground (`playground/index.html`) for the visual reasoning.
Short version:

- **Live "this-week-to-date"** is the primary view. Office-only viewing eliminates
  the usual Monday-0s problem.
- **Reference = last week total**, not 4-week rolling average. Partial-vs-full
  averaging reads as permanently behind. No arrow in live mode; partial weeks
  are contextualised, not judged.
- **Projects touched is the hero** — the "clients moved forward" number.
- **Comments demoted to a footer line.** RP uses comments as forum threads, not
  actionable tasks, so "resolved/posted" ratios and stale-thread alerts don't fit.
- **5-dot progress pip** (M T W T F) on live views keeps partiality honest
  rather than hiding it.
