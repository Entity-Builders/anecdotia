# Anecdotia

Mini PWA pilot for `app-anecdotia`.

The first pilot is intentionally transcript-first and local-safe:

- Family-specific landing route: `/obrach`
- Story drafts are saved in browser `localStorage`
- Private roster and seed anecdotes can be synced from the ignored OpenSpec
  pilot files for local/manual pilot builds
- Durable Supabase persistence is deferred until the dedicated `anecdotia`
  schema, RLS policies, and invitation access checks are implemented

## Development

```bash
yarn workspace anecdotia dev
```

The default dev server runs on port `5178`.

## Private Pilot Data

The committed app uses safe sample data. To run a local/manual build with the
ignored Familia Obrach pilot files, run:

```bash
yarn workspace anecdotia pilot:data:sync
```

This copies ignored files from
`openspec/changes/define-anecdotia-family-story-mvp/pilot-data/` into
`apps/anecdotia/public/pilot-data/`. The destination `*.local.*` files are also
ignored by git.

The sync script sanitizes the roster before it enters `public/`, removing
`notesForJuanOnly`. Do not manually copy the raw roster into `public/`.

## Verification

```bash
yarn workspace anecdotia test
yarn workspace anecdotia build
```

Before any production pilot stores real family data server-side, complete the
OpenSpec Supabase/RLS tasks in
`openspec/changes/define-anecdotia-family-story-mvp/tasks.md`.
