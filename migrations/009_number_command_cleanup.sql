ALTER TABLE discord_number_commands ADD COLUMN deleted_at TEXT;
ALTER TABLE discord_number_commands ADD COLUMN next_delete_at TEXT;
ALTER TABLE discord_number_commands ADD COLUMN delete_error TEXT;
CREATE INDEX discord_number_cleanup_due ON discord_number_commands(channel_id,outcome,deleted_at,next_delete_at);
-- Existing messages remain untouched; only newly processed commands are eligible.
ALTER TABLE discord_number_commands ADD COLUMN cleanup_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_number_sync ADD COLUMN can_manage_messages INTEGER;
