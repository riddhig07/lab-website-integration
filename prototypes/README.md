# Prototypes

Experimental app code that is not wired into production (Vercel `/` + `/portal`, Railway API).

## `sherp-lab-next/` (Next.js)

Imported from [riddhig07/sherp-lab](https://github.com/riddhig07/sherp-lab) (public site + intranet UI, content in `src/content/`).

```bash
cd prototypes/sherp-lab-next
npm install
cp .env.example .env.local   # optional: intranet password, Drive, GitHub
npm run dev                    # http://localhost:3001
```

**Production lab site** remains `frontend/`, `frontend-private/`, and `backend/` at the repo root. Porting pieces from the prototype means moving content/components into those apps, not replacing the stack in one step.

To pull updates from your old repo:

```bash
git fetch sherp-lab main
git subtree pull --prefix=prototypes/sherp-lab-next sherp-lab main --squash
```
