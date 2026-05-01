# Postgres for V1 API Persistence

Label will adapt the bookmarks-core persistence layer from SQLite to Postgres with Drizzle for the v1 API. The deployment target is a single VPS with a dedicated Postgres instance, and using Postgres now avoids an early persistence migration while still keeping the system operationally simple.
