CREATE TYPE "public"."room_role" AS ENUM('creator', 'member');--> statement-breakpoint
ALTER TABLE "game_player" ADD COLUMN "role" "room_role" DEFAULT 'member' NOT NULL;--> statement-breakpoint
UPDATE "game_player" AS gp
SET "role" = 'creator'
FROM "game_room" AS gr
WHERE gp."room_id" = gr."id"
  AND gp."user_id" = gr."created_by";
