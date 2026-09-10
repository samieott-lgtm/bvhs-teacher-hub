# BVHS Teacher Hub

A staff resource site for Bryce Valley High School - announcements, weekly updates,
a calendar, forms, staff directory, and more, all editable by the principal without
touching code.

## Phase 2 (this version)
- **PostgreSQL database** - all content (announcements, events, staff directory, etc.) now
  lives in a real database instead of JSON files. Railway adds this with a couple of clicks.
- **Staff logins** - the principal can create an account for each teacher from the admin
  area (`/admin/users`). Everyone with an account can log in and check off shared to-do
  items. Accounts marked "admin" can also manage all site content.
- **File uploads for documents** - under Forms & Documents, the admin can upload an actual
  PDF/Word file instead of pasting a link.
- Uploaded files still live on disk (on a Railway Volume), while structured content lives
  in Postgres.

## Phase 1 (previous version)
- Public pages for every section, one shared admin login, content stored as JSON files.

## Phase 3 (planned)
- AI features using the Claude API - for example, a staff-facing assistant that can
  answer "what's due this week" or help draft communications, grounded in this site's
  own content.

## Running locally
Local testing now requires a PostgreSQL database, since content lives there instead of
JSON files. The simplest option is to skip local testing and deploy straight to Railway
(the deployment guide covers this) - Railway gives you a real database automatically.

If you do want to test locally and already have Postgres installed:
```
npm install
cp .env.example .env
# edit .env and fill in DATABASE_URL for your local Postgres
npm start
```
Then visit http://localhost:3000.

## Persistence (important)
Structured content (announcements, events, staff, etc.) lives in PostgreSQL and survives
redeploys automatically once a database is attached. Uploaded files (Forms & Documents)
still live on disk, so you need a Railway Volume with `DATA_DIR` set to its mount path for
uploaded files to survive redeploys - see the deployment guide.
