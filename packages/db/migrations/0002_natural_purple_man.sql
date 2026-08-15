CREATE TABLE "vehicle_research" (
	"id" text PRIMARY KEY NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"avg_price_cents" integer,
	"research" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"researched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_research_key_idx" ON "vehicle_research" USING btree ("make","model","year");