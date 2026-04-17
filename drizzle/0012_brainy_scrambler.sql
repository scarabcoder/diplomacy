DELETE FROM "user" WHERE "is_anonymous" = true;--> statement-breakpoint
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "is_anonymous";