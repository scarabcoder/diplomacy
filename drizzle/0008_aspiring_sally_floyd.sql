CREATE TABLE "bot_brain_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"power" "power" NOT NULL,
	"strategic_plan" text DEFAULT '' NOT NULL,
	"observations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationships" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_brain_state_player_uniq" UNIQUE("player_id")
);
--> statement-breakpoint
ALTER TABLE "bot_brain_state" ADD CONSTRAINT "bot_brain_state_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_brain_state" ADD CONSTRAINT "bot_brain_state_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_brain_state" ADD CONSTRAINT "bot_brain_state_bot_id_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_brain_state_room_idx" ON "bot_brain_state" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "bot_brain_state_bot_idx" ON "bot_brain_state" USING btree ("bot_id");