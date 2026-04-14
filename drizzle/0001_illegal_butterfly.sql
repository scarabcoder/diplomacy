CREATE TYPE "public"."build_action" AS ENUM('build', 'disband', 'waive');--> statement-breakpoint
CREATE TYPE "public"."game_phase" AS ENUM('order_submission', 'order_resolution', 'retreat_submission', 'retreat_resolution', 'build_submission', 'build_resolution');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('hold', 'move', 'support', 'convoy');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'civil_disorder', 'eliminated');--> statement-breakpoint
CREATE TYPE "public"."power" AS ENUM('england', 'france', 'germany', 'russia', 'austria', 'italy', 'turkey');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('lobby', 'playing', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('spring', 'fall');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('army', 'fleet');--> statement-breakpoint
CREATE TABLE "game_build" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"power" "power" NOT NULL,
	"action" "build_action" NOT NULL,
	"unit_type" "unit_type",
	"province" text NOT NULL,
	"coast" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_order_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"success" boolean NOT NULL,
	"result_type" text NOT NULL,
	"dislodged_from" text,
	"retreat_options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"power" "power" NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"unit_province" text NOT NULL,
	"order_type" "order_type" NOT NULL,
	"target_province" text,
	"supported_unit_province" text,
	"via_convoy" boolean DEFAULT false NOT NULL,
	"coast" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"power" "power",
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"is_spectator" boolean DEFAULT false NOT NULL,
	"is_ready" boolean DEFAULT false NOT NULL,
	"supply_center_count" integer DEFAULT 0 NOT NULL,
	"missed_turn_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_player_room_user_uniq" UNIQUE("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "game_retreat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"power" "power" NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"unit_province" text NOT NULL,
	"retreat_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "room_status" DEFAULT 'lobby' NOT NULL,
	"current_turn_id" uuid,
	"winner_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_room_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "game_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"year" integer NOT NULL,
	"season" "season" NOT NULL,
	"phase" "game_phase" NOT NULL,
	"unit_positions" jsonb NOT NULL,
	"supply_centers" jsonb NOT NULL,
	"dislodged_units" jsonb,
	"is_complete" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_turn_room_number_uniq" UNIQUE("room_id","turn_number")
);
--> statement-breakpoint
ALTER TABLE "game_build" ADD CONSTRAINT "game_build_turn_id_game_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_build" ADD CONSTRAINT "game_build_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_order_result" ADD CONSTRAINT "game_order_result_order_id_game_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."game_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_order" ADD CONSTRAINT "game_order_turn_id_game_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_order" ADD CONSTRAINT "game_order_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_retreat" ADD CONSTRAINT "game_retreat_turn_id_game_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."game_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_retreat" ADD CONSTRAINT "game_retreat_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_room" ADD CONSTRAINT "game_room_winner_id_user_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_room" ADD CONSTRAINT "game_room_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_turn" ADD CONSTRAINT "game_turn_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_build_turn_power_idx" ON "game_build" USING btree ("turn_id","power");--> statement-breakpoint
CREATE INDEX "game_order_result_order_idx" ON "game_order_result" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "game_order_turn_power_idx" ON "game_order" USING btree ("turn_id","power");--> statement-breakpoint
CREATE INDEX "game_order_room_idx" ON "game_order" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "game_player_room_idx" ON "game_player" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "game_player_user_idx" ON "game_player" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_retreat_turn_power_idx" ON "game_retreat" USING btree ("turn_id","power");--> statement-breakpoint
CREATE INDEX "game_room_code_idx" ON "game_room" USING btree ("code");--> statement-breakpoint
CREATE INDEX "game_turn_room_idx" ON "game_turn" USING btree ("room_id");