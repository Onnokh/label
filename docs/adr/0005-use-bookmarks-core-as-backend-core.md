# Use bookmarks-core as the API Project

Label will move the existing `bookmarks-core` project into the monorepo and rename it to the API project rather than introducing separate `core` and `api` packages. The project already models capture, saved bookmark records, enrichment jobs, metadata fetching, content extraction, AI enrichment, Drizzle persistence, and Effect service boundaries, so adapting it in place keeps the backend moving parts small.
