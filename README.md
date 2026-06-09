### Local development:
```bash
cp .env.example .env
# Edit .env with your values
npm run dev  # Watches and restarts on source changes
```# Local setup (detailed):
```bash
# 1. Copy the example env file
cp .env.example .env

# 2. Set required variables in .env
#    - GATEWAY_API_KEY (required; any string, e.g. "dev-key")
#    - PORT (default 3000; change for local dev)

# 3. Install dependencies and start
npm install
npm run dev          # hot-reload dev server on :3000
```