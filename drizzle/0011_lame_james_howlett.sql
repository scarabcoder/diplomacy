CREATE TYPE "public"."notification_channel" AS ENUM('email', 'web_push');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('message', 'phase_result');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'dead');--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"room_id" uuid NOT NULL,
	"thread_id" uuid,
	"trigger_message_id" uuid,
	"phase_result_id" uuid,
	"dedupe_key" text NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_dedupe_key_uniq" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "user_notification_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_on_message" boolean DEFAULT true NOT NULL,
	"email_on_phase_result" boolean DEFAULT true NOT NULL,
	"web_push_on_message" boolean DEFAULT true NOT NULL,
	"web_push_on_phase_result" boolean DEFAULT true NOT NULL,
	"message_debounce_seconds" integer DEFAULT 300 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "web_push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_room_id_game_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."game_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_thread_id_room_conversation_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."room_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_trigger_message_id_room_message_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."room_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notification_preference" ADD CONSTRAINT "user_notification_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscription" ADD CONSTRAINT "web_push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_status_scheduled_idx" ON "notification_outbox" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_outbox_user_kind_idx" ON "notification_outbox" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "web_push_subscription_user_idx" ON "web_push_subscription" USING btree ("user_id");