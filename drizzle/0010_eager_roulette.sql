ALTER TABLE "room_message" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "room_message" ADD COLUMN "proposal_payload" jsonb;