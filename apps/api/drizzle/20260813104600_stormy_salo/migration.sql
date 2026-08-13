CREATE TYPE "profile_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"handle" text NOT NULL,
	"visibility" "profile_visibility" DEFAULT 'private'::"profile_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_id_unique" ON "profiles" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_lower_unique" ON "profiles" (lower("handle"));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;