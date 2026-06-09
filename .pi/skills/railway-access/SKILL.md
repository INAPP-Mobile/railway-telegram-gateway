---
name: railway-access
description: Railway CLI template management — publish, update, and configure Railway templates. Covers CLI setup, template CRUD, required README sections, env var conventions, health checks, and known agent limitations.
---

# Railway Access — Template Management Skill

A general-purpose skill for managing Railway templates via the Railway CLI. Use this when deploying new projects to Railway, updating existing templates, or troubleshooting template configuration.

## Table of Contents

- [CLI Setup & Auth](#cli-setup--auth)
- [Template CRUD (CLI)](#template-crud-cli)
- [Required README Sections](#required-readme-sections)
- [Environment Variable Conventions](#environment-variable-conventions)
- [Health Checks](#health-checks)
- [Deploy Configuration Files](#deploy-configuration-files)
- [Custom Template Image (Marketplace Card)](#custom-template-image-marketplace-card)
- [Creating a Template from a Project](#creating-a-template-from-a-project)
- [Recreating a Template to Refresh Variable Defaults](#recreating-a-template-to-refresh-variable-defaults)
- [GitHub ↔ Railway Sync](#github--railway-sync)
- [Agent Limitations](#agent-limitations)
- [Reference Cheatsheet](#reference-cheatsheet)

## CLI Setup & Auth

The Railway CLI (`railway`) is installed as a standalone binary (not via npm). Check if installed and authenticated:

```bash
# Check CLI exists
which railway  # ~/.railway/bin/railway

# Check login status
railway whoami  # Shows email/user if authenticated

# Login (interactive browser flow)
railway login

# Login with a token (non-interactive, CI-friendly)
railway login --token <token>
```

Auth tokens are stored in `~/.railway/`. The CLI persists across sessions.

### Workspace Context

Commands operate in the active workspace. Switch workspaces:

```bash
railway link       # Interactive workspace/project selection
railway whoami     # Shows current workspace
```

## Template CRUD (CLI)

Railway templates can be managed entirely through the CLI — no GitHub push needed for metadata changes.

### List Templates

```bash
railway templates list --json
```

Returns all templates (published and unpublished) for the active workspace:

```json
[
  {
    "id": "uuid-string",
    "code": "template-slug",
    "name": "Template Name",
    "description": "Short description (max 75 chars)",
    "category": "Bots",
    "status": "PUBLISHED",
    "url": "https://railway.com/deploy/template-slug",
    "workspaceId": "...",
    "workspaceName": "..."
  }
]
```

`status` values:
- `PUBLISHED` — visible in marketplace, searchable
- `UNPUBLISHED` — draft, only accessible via direct URL

### Publish / Update a Template

The `publish` subcommand creates **and** updates templates (no separate `update` command).

```bash
railway templates publish <template-id> \
  --category <Category> \
  --description "Your description (max 75 chars)" \
  --readme-file ./README.md \
  --json
```

**Key constraints:**
- **Descriptions are capped at 75 characters.** The CLI enforces this.
- `--readme-file` accepts any markdown file path. The content is validated for required sections (see below).
- `--json` outputs the full template object on success.
- The **template ID is a UUID** (from `templates list`), not the slug.
- `--category` must match an existing Railway category (e.g. `Bots`, `Web Services`, `Databases`, `Starter`).

### Custom Template Image (Marketplace Card)

```bash
railway templates publish <template-id> \
  --image "https://raw.githubusercontent.com/org/repo/branch/path/to/image.svg" \
  --json
```

The `--image` flag sets a custom image for the template's marketplace card/listing. This is the image shown in template galleries, search results, and category pages.

**To clear the image:**
```bash
railway templates publish <template-id> --image none --json
# or
railway templates publish <template-id> --image clear --json
```

#### Image Requirements

| Property | Recommendation |
|----------|---------------|
| Format | SVG or PNG. SVG preferred (scales cleanly) |
| Dimensions | 1200×630 (standard OG/social card ratio) |
| Hosting | Must be a publicly accessible URL. GitHub raw URLs work well. |
| Location in repo | `.pi/assets/og-image.svg` (keeps assets organized) |

#### Recipe: Create and Set a Custom Template Image

1. **Design the SVG** — create at `.pi/assets/og-image.svg`:
   - 1200×630 viewport
   - Dark background (matches Railway's dark theme)
   - Include: project name, tagline, relevant iconography
   - Use `<linearGradient>` for modern look
   - Add visual elements representing the project (icons, connection lines, feature badges)

2. **Push to GitHub:**
   ```bash
   git add .pi/assets/og-image.svg
   git commit -m "Add custom OG image for Railway template card"
   git push origin <template-branch>
   ```

3. **Set via CLI:**
   ```bash
   railway templates publish <template-id> \
     --image "https://raw.githubusercontent.com/<org>/<repo>/<branch>/.pi/assets/og-image.svg" \
     --json
   ```

4. **Verify:**
   ```bash
   railway templates list --json | jq '.[] | select(.id=="<template-id>") | .image'
   ```

#### Known Limitation

The `--image` flag sets the template's **marketplace card image** (used in gallery listings, search results, category pages). It does **not** replace the auto-generated OG image on the individual deploy page at `railway.com/deploy/<slug>`.

Railway's deploy page always generates its own OG meta tags via their OG image service:
```
https://og.railway.com/api/image?fileType=png&layoutName=template&...
```

The OG image description is pulled from the **GitHub repo description** (synced automatically). To update the OG meta tags, update the GitHub repo description manually on github.com.

**Two image surfaces, two controls:**

| Surface | Controlled by | Agent-automated? |
|---------|---------------|-----------------|
| Marketplace card image | `railway templates publish --image` | ✅ Yes, via CLI |
| Deploy page OG meta tags | GitHub repo description | ❌ Manual on github.com |

### Other Template Commands

```bash
railway templates search <query>       # Search marketplace
railway templates create               # Create from an existing project
railway templates unpublish <code>     # Remove from marketplace listings
railway templates delete <id>          # Delete permanently
```

### Creating a Template from a Project

```bash
# Interactive
railway templates create

# Non-interactive (from an existing project)
railway templates create --project <project-name> --environment production --json
```

The CLI returns the new (UNPUBLISHED) template JSON with id, code/slug, and editorUrl.

#### Requirements

- The project must have a **running service linked to a GitHub repo** as its source.
- Services deployed via `railway up` (direct upload) **cannot** be used to create templates. The CLI will error: `Service does not have a source that can be used to generate a template`.

#### Fix: Connect a Service to GitHub Source

If the service was deployed via `railway up` instead of from a GitHub repo:

```bash
railway service source connect \
  --repo owner/repo \
  --branch main \
  --service service-name
```

Then retry `railway templates create`.

#### Full Workflow: Deploy + Create Template

```bash
# 1. Push code to GitHub
# 2. Deploy to Railway from CLI (creates initial service)
railway up --service my-service

# 3. Connect service to GitHub repo source
railway service source connect --repo owner/repo --branch main --service my-service

# 4. Create template from the project
railway templates create --project my-project --environment production --json
```

### Recreating a Template to Refresh Variable Defaults

This is the **only** reliable way to update env var defaults on an existing template. Template variable defaults are cached at creation time and subsequent `.env.example` edits are ignored.

```bash
# 1. Update .env.example with new defaults, push to GitHub
git add .env.example
git commit -m "Update env var defaults"
git push origin <template-branch>

# 2. Delete the existing template
railway templates delete <template-id> --yes

# 3. Ensure a service is running from the repo (deploy if needed)
railway up --service my-service
railway service source connect --repo owner/repo --branch <template-branch> --service my-service

# 4. Create a fresh template (this re-reads .env.example)
railway templates create --project my-project --environment production --json

# 5. Publish with all metadata
railway templates publish <new-template-id> \
  --category <Category> \
  --description "75-char description" \
  --readme-file README.md \
  --image <image-url> \
  --json

# 6. Update any README deploy buttons to point to the new URL
```

**Downsides of recreating:**
- The deploy URL changes (new auto-generated slug)
- The old URL stops working (404)
- Must update README and any references to the old deploy URL
- Template UUID changes

## Required README Sections

When publishing or updating a template's readme with `--readme-file`, the markdown **must** contain these **exact** section headings. The CLI validates them and rejects the file if any are missing.

```markdown
# Deploy and Host <project-name>

## About Hosting

## Why Deploy

## Common Use Cases

## Dependencies for

### Deployment Dependencies
```

**Strategy:** Append these sections at the bottom of your main README. They're template metadata, not user-facing content. Do NOT embed them in the middle of your project documentation.

Example template-compliant README structure:

```markdown
# Project Name
... (architecture, API docs, usage, etc.)

## License
...

# Deploy and Host Project Name
Source: https://github.com/org/repo

## About Hosting
One-sentence description of what the project does.

## Why Deploy
Why someone would deploy this on Railway.

## Common Use Cases
- Bullet list of use cases

## Dependencies for
### Deployment Dependencies
Railway auto-detects the runtime. No additional deps required.
```

## Environment Variable Conventions

Railway auto-detects template variables from the repo. The sources in priority order:

1. **`railway.toml`** — explicit variable declarations
2. **`.env.example`** — auto-scanned for variable names
3. **No config file** — Railway scans source for env var usage

### Best Practices

- Keep `.env.example` in the repo root with all documented variables
- Use plain comments above each variable (`# Description`) as descriptions (Railway shows these in the deploy form). **Avoid decorative section headers** like `# ─── Required ─────` — they may confuse Railway's parser.
- **Required variables with no good default** — set value to empty (`KEY=`). This forces the user to type something in the deploy form.
- **Optional variables** — provide sensible production defaults (`MAX_CLIENTS=10`)
- **Placeholder values** are dangerous — never use `KEY=changeme-please`. Users may deploy without changing it.
- Include `PORT` with a default of `3000` (Railway overrides this at runtime)

#### ⚠️ Critical: App Must Handle Missing Required Vars Gracefully

Empty defaults (`KEY=`) mean the app starts with no value during first deploy. If the app calls `process.exit(1)` on a missing env var, the Railway health check will fail and the deploy will roll back.

**Solution:** Generate a random fallback key and log a warning, instead of crashing:

```typescript
import crypto from 'crypto';

const USER_KEY = process.env.MY_API_KEY?.trim() || '';
const MY_API_KEY = USER_KEY || `gw-${crypto.randomBytes(16).toString('hex')}`;

if (!USER_KEY) {
  console.warn('⚠️  MY_API_KEY not set. A random key was generated for this session.');
  console.warn(`   Generated key: ${MY_API_KEY}`);
  console.warn(`   Set MY_API_KEY in your Railway dashboard to use a persistent key.`);
}
```

This lets the first deploy pass health check. Users see the generated key in logs and can set their own later.

#### After Updating `.env.example`

Railway **caches** env var defaults at **template creation time** only. Editing `.env.example` on an existing template has no effect on the deploy form defaults. To update defaults, you must **delete and recreate** the template (see [Recreating a Template to Refresh Variable Defaults](#recreating-a-template-to-refresh-variable-defaults)).

```bash
# ❌ This does NOT update variable defaults:
railway templates publish <template-id> --json

# ✅ Correct: delete, push, deploy, recreate:
railway templates delete <template-id> --yes
# ... push updated .env.example ...
# ... deploy a service from repo ...
railway templates create --project <project> --environment production --json
railway templates publish <new-template-id> --category ... --description ... --readme-file README.md --image <url> --json
```

#### Example `.env.example` (Production-Ready)

```env
# Required: Auth key for WebSocket & Admin API. Set a strong unique value.
# Accepts comma-separated keys.
GATEWAY_API_KEY=

# Public URL for bot webhook registration. Railway auto-sets this at runtime.
# Only set if using a custom domain.
BASE_URL=

# Telegram webhook secret for update verification.
WEBHOOK_SECRET=

# Max bot subscriptions per WebSocket client.
SUBSCRIPTION_MAX_PER_CLIENT=10

# WebSocket ping interval in milliseconds.
WEBSOCKET_HEARTBEAT_INTERVAL=30000

# Skip Telegram getMe validation (set to "true" for local dev).
SKIP_BOT_VALIDATION=false

# Server port (Railway sets this automatically).
PORT=3000
```



## Health Checks

Railway uses health checks to confirm a service is ready before routing traffic. Configured in `railway.toml`.

### Implementation (Hono/Express/Node)

```typescript
// Hono (TypeScript)
app.get('/health', (c) => c.json({ status: 'healthy' }));

// Express
app.get('/health', (req, res) => res.json({ status: 'healthy' }));
```

### Configuration

```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
```

- `healthcheckPath` — endpoint Railway polls after deploy
- `healthcheckTimeout` — seconds to wait before marking unhealthy (default: 30)
- The endpoint should return a `200` status on success
- Deploy fails if health check doesn't pass within the timeout

## Deploy Configuration Files

### `railway.toml` (Primary, Recommended)

Full configuration in TOML format. Supports build, deploy, and service configuration.

```toml
[build]
builder = "DOCKERFILE"       # or "NIXPACKS"
dockerfile = "./Dockerfile"  # required if builder is DOCKERFILE

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30

# Optional: Service configuration
# startCommand = "node dist/index.js"
# numReplicas = 2
```

### `railway.json` (Legacy, Nixpacks Fallback)

```json
{
  "build": {
    "builder": "nixpacks"
  }
}
```

**Priority:** If `railway.toml` exists, it takes precedence. `railway.json` is used as fallback.

## GitHub ↔ Railway Sync

Railway auto-syncs templates from a specific GitHub branch. When you push to that branch, Railway updates the template for existing deployers (shows "Update Available" banner).

### How Sync Works

1. A GitHub repo is linked to the template at creation time
2. You specify which branch Railway watches (e.g. `main`, `template`)
3. Any push to that branch triggers a template sync
4. **GitHub repo description** is the source of truth for the template's public-facing subtitle on the deploy page
5. OG meta tags and search previews also pull from the GitHub description

### Update Paths

| Type | Method | Requires |
|------|--------|----------|
| Code changes | `git push` to synced branch | Git access |
| Template description | `railway templates publish` (preferred) or GitHub repo description edit | CLI auth or manual |
| Template readme | `railway templates publish --readme-file` | CLI auth |
| Template image (card) | `railway templates publish --image <url>` | CLI auth + hosted image URL |
| Template variables | Edit `.env.example`, then republish | Git + CLI |

## Agent Limitations

When managing Railway templates from this agent environment:

| Limitation | Workaround |
|-----------|------------|
| No `gh` CLI — can't interact with GitHub API | Use Railway CLI instead for template metadata |
| No `GITHUB_TOKEN` — can't auth to GitHub API | GitHub repo description is the one thing that requires manual action on github.com |
| Template description 75-char cap | Keep descriptions tight. Test with `--json` flag first. |
| README must have specific Railway sections | Always append the 6 required sections at the end of the README before running `publish --readme-file` |
| `--image` only sets marketplace card, not deploy page OG tags | These are two separate surfaces — card is CLI-automated, OG tags need GitHub repo description |
| Template env var defaults cached at creation, not updated by pushes | Must delete + recreate template. See [Recreating a Template to Refresh Variable Defaults](#recreating-a-template-to-refresh-variable-defaults) for the full workflow. |
| App crashes on deploy if required env var is empty (`process.exit(1)`) | Generate a random fallback key and log a warning instead of crashing. See the Critical section in [Environment Variable Conventions](#environment-variable-conventions). |
| `railway up` deployed services can't be used for template creation | Connect the service to GitHub source via `railway service source connect --repo ... --branch ... --service ...` before running `railway templates create`. |
| Decorative section headers in `.env.example` may confuse Railway's parser | Use simple `# Comment` above each variable. Avoid `# ─── Required ─────` style headers. |

## Reference Cheatsheet

### Quick Commands

```bash
# Auth
railway login
railway whoami

# Templates
railway templates list --json
railway templates publish <id> --description "..." --readme-file README.md --image <url> --json
railway templates search <query>
railway templates unpublish <slug>
railway templates delete <id>

# Projects
railway link
railway status
railway logs
railway variables
```

### Railway Config File Reference

| Config | Format | Location | Purpose |
|--------|--------|----------|---------|
| `railway.toml` | TOML | Repo root | Primary: build, deploy, health check config |
| `railway.json` | JSON | Repo root | Legacy: fallback if no `.toml` |
| `.env.example` | Key=Value | Repo root | Template variable definitions |

### Required README Checklist

Before `railway templates publish --readme-file`, verify these headings exist in the markdown:

- [ ] `# Deploy and Host <name>`
- [ ] `## About Hosting`
- [ ] `## Why Deploy`
- [ ] `## Common Use Cases`
- [ ] `## Dependencies for`
- [ ] `### Deployment Dependencies`
