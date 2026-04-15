CREATE TYPE "public"."room_conversation_archived_reason" AS ENUM('participant_eliminated', 'room_completed');--> statement-breakpoint
CREATE TYPE "public"."room_conversation_kind" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."room_conversation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "room_conversation_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"last_read_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_conversation_participant_conversation_player_uniq" UNIQUE("conversation_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "room_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_key" text NOT NULL,
	"kind" "room_conversation_kind" NOT NULL,
	"status" "room_conversation_status" DEFAULT 'active' NOT NULL,
	"archived_reason" "room_conversation_archived_reason",
	"created_by_player_id" uuid NOT NULL,
	"last_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_conversation_room_participant_key_uniq" UNIQUE("room_id","participant_key")
);
--> statement-breakpoint
CREATE TABLE "room_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_player_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "room_conversation_participant" ADD CONSTRAINT "room_conversation_participant_conversation_id_room_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."room_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_conversation_participant" ADD CONSTRAINT "room_conversation_participant_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_conversation" ADD CONSTRAINT "room_conversation_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_conversation" ADD CONSTRAINT "room_conversation_created_by_player_id_game_player_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_message" ADD CONSTRAINT "room_message_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_message" ADD CONSTRAINT "room_message_conversation_id_room_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."room_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_message" ADD CONSTRAINT "room_message_sender_player_id_game_player_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_conversation_participant_conversation_idx" ON "room_conversation_participant" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "room_conversation_participant_player_idx" ON "room_conversation_participant" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "room_conversation_room_idx" ON "room_conversation" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_message_room_idx" ON "room_message" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_message_conversation_created_idx" ON "room_message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "room_message_sender_idx" ON "room_message" USING btree ("sender_player_id");