CREATE TABLE "bot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_player_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_player_credential_player_uniq" UNIQUE("player_id")
);
--> statement-breakpoint
CREATE TEMP TABLE "__player_user_map" AS
SELECT
	"id" AS "player_id",
	"room_id",
	"user_id",
	"is_bot"
FROM "game_player"
WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TEMP TABLE "__bot_player_backfill" AS
SELECT
	"player_id",
	"user_id",
	gen_random_uuid() AS "bot_id"
FROM "__player_user_map"
WHERE "is_bot" = true;
--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" RENAME COLUMN "user_id" TO "player_id";--> statement-breakpoint
ALTER TABLE "game_room" RENAME COLUMN "winner_id" TO "winner_player_id";--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" DROP CONSTRAINT "game_phase_result_ack_result_user_uniq";--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" DROP CONSTRAINT "game_phase_result_ack_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "game_room" DROP CONSTRAINT "game_room_winner_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "game_phase_result_ack_user_idx";--> statement-breakpoint
ALTER TABLE "game_player" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "game_player" ADD COLUMN "bot_id" uuid;--> statement-breakpoint
INSERT INTO "bot" ("id", "name")
SELECT
	"__bot_player_backfill"."bot_id",
	COALESCE("user"."name", 'Bot')
FROM "__bot_player_backfill"
LEFT JOIN "user" ON "user"."id" = "__bot_player_backfill"."user_id";
--> statement-breakpoint
UPDATE "game_player"
SET
	"bot_id" = "__bot_player_backfill"."bot_id",
	"user_id" = NULL
FROM "__bot_player_backfill"
WHERE "game_player"."id" = "__bot_player_backfill"."player_id";
--> statement-breakpoint
UPDATE "game_phase_result_ack"
SET "player_id" = "__player_user_map"."player_id"::text
FROM "game_phase_result", "__player_user_map"
WHERE
	"game_phase_result_ack"."phase_result_id" = "game_phase_result"."id"
	AND "__player_user_map"."room_id" = "game_phase_result"."room_id"
	AND "__player_user_map"."user_id" = "game_phase_result_ack"."player_id";
--> statement-breakpoint
UPDATE "game_room"
SET "winner_player_id" = "__player_user_map"."player_id"::text
FROM "__player_user_map"
WHERE
	"game_room"."id" = "__player_user_map"."room_id"
	AND "game_room"."winner_player_id" = "__player_user_map"."user_id";
--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ALTER COLUMN "player_id" TYPE uuid USING "player_id"::uuid;--> statement-breakpoint
ALTER TABLE "game_room" ALTER COLUMN "winner_player_id" TYPE uuid USING "winner_player_id"::uuid;--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ALTER COLUMN "player_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_player_credential" ADD CONSTRAINT "bot_player_credential_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_player_credential" ADD CONSTRAINT "bot_player_credential_bot_id_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_player_credential_bot_idx" ON "bot_player_credential" USING btree ("bot_id");--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ADD CONSTRAINT "game_phase_result_ack_player_id_game_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_player"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_bot_id_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_room" ADD CONSTRAINT "game_room_winner_player_id_game_player_id_fk" FOREIGN KEY ("winner_player_id") REFERENCES "public"."game_player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_phase_result_ack_player_idx" ON "game_phase_result_ack" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "game_player_bot_idx" ON "game_player" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_player_room_bot_uniq" ON "game_player" USING btree ("room_id","bot_id") WHERE "game_player"."bot_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "game_phase_result_ack" ADD CONSTRAINT "game_phase_result_ack_result_player_uniq" UNIQUE("phase_result_id","player_id");--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_actor_check" CHECK ((("user_id" IS NOT NULL AND "bot_id" IS NULL AND "is_bot" = false) OR ("user_id" IS NULL AND "bot_id" IS NOT NULL AND "is_bot" = true)));--> statement-breakpoint
DELETE FROM "user"
WHERE
	"id" IN (
		SELECT "user_id"
		FROM "__bot_player_backfill"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "game_player"
		WHERE "game_player"."user_id" = "user"."id"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "game_room"
		WHERE "game_room"."created_by" = "user"."id"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "session"
		WHERE "session"."user_id" = "user"."id"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "account"
		WHERE "account"."user_id" = "user"."id"
	);
