CREATE TABLE "game_phase_result_ack" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_result_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_phase_result_ack_result_user_uniq" UNIQUE("phase_result_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "game_phase_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"year" integer NOT NULL,
	"season" "season" NOT NULL,
	"phase" "game_phase" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ADD CONSTRAINT "game_phase_result_ack_phase_result_id_game_phase_result_id_fk" FOREIGN KEY ("phase_result_id") REFERENCES "public"."game_phase_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ADD CONSTRAINT "game_phase_result_ack_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_phase_result" ADD CONSTRAINT "game_phase_result_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_phase_result" ADD CONSTRAINT "game_phase_result_turn_id_game_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_phase_result_ack_user_idx" ON "game_phase_result_ack" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_phase_result_room_created_idx" ON "game_phase_result" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "game_phase_result_turn_idx" ON "game_phase_result" USING btree ("turn_id");