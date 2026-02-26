DO $$ BEGIN
 ALTER TABLE "class_presence_snapshots" ADD CONSTRAINT "class_presence_snapshots_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "class_presence_snapshots" ADD CONSTRAINT "class_presence_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "class_presence_snapshots" ADD CONSTRAINT "class_presence_snapshots_class_id_user_id_unique" UNIQUE("class_id","user_id");