ALTER TABLE "junkclaw"."listings" ADD COLUMN "photo_observations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "junkclaw"."listings" ADD COLUMN "photo_summary" text;--> statement-breakpoint
ALTER TABLE "junkclaw"."listings" ADD COLUMN "photo_analysed_at" timestamp with time zone;