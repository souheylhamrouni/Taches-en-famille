# TâcheHéros — PRD

## Problem Statement
Cross-platform mobile app (React Native / Expo) to manage, track and gamify family chores, schoolwork and daily tasks. Duolingo-inspired, 100% French UI. Real-time-ish sync via backend. Roles: Parent (PIN-protected) and Kid.

## Architecture / User Choices
- **Backend**: FastAPI + MongoDB (uuid string ids, no ObjectId leakage). Scheduler via APScheduler.
- **Auth**: email/password JWT (bearer). Parent 4-digit PIN → short-lived pin_token via `X-Parent-Pin-Token` header for parent-only mutations.
- **Photos**: Emergent Managed Object Storage (backend proxy). `GET /api/photos/{path}` accepts Authorization header (native) or `?token=` query (web `<img>`).
- **Push**: Emergent Managed Push (SuprSend relay). `EMERGENT_PUSH_KEY=placeholder` until deploy. Works only on built app, not Expo Go.
- **Design**: /app/design_guidelines.json — green/orange/gold palette, chunky rounded cards.

## User Personas
- Parent: sets up family, creates tasks/rewards, sets points & penalties, validates photos, manages calendar/shopping.
- Kid: completes tasks (photo proof), votes on family proofs, climbs leaderboard, spends points in shop.

## Core Requirements (static)
- Tasks (daily/weekly/once), photo-proof peer validation (family votes approve/reject), points + streaks.
- Auto penalty at 20:00 (lose points + break streak) + 19:00 reminder (cron).
- Weekly leaderboard podium, reward shop, family dashboard, shared calendar, shared shopping list, push notifications.

## Implemented (2026-06-18)
- Auth: register (create family / join via family_id), login, /me, parent PIN verify.
- Tasks: CRUD (parent+PIN), today_status per user, active filter.
- Completions: photo upload → pending; non-photo auto-approve+award; duplicate same-day 409.
- Peer validation feed: vote approve/reject, parent vote or 1 approve resolves, points+streak awarded.
- Rewards: CRUD (parent+PIN), claim (debits points), claims list.
- Leaderboard, family + code sharing, calendar CRUD, shopping CRUD (toggle), penalties + manual dev trigger.
- Push registration endpoint + `_layout.tsx` handlers/channels/tap routing.
- French demo family auto-seeded on startup (papa@demo.fr etc.).
- Kid tabs: Accueil / Tâches / Classement / Boutique / Plus. Parent tabs: Tableau / Tâches / Récompenses / Réglages. Shared: validate / calendar / shopping.
- Tested: backend 24/24 pytest pass; frontend core flows pass. Fixed active-task filter + photo token-query auth.

## Backlog / Remaining
- **P1**: Realtime live updates (currently pull-to-refresh + focus refetch). Consider websockets/polling.
- **P1**: Month-grid calendar view (currently agenda list).
- **P2**: Achievement badges, sound effects & richer completion animations.
- **P2**: Reward claim fulfillment workflow (parent marks delivered).
- **P2**: Migrate FastAPI on_event → lifespan.

## Next Tasks
- Awaiting user direction on which enhancement to build next.
