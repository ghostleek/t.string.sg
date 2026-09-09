-- Migration number: 0002 	 clicks_bot_ts
-- The dashboard overview filters clicks by (is_bot, ts) across ALL links; the
-- existing (link_id, is_bot, ts) index cannot seek on that, so without this
-- every overview load would read every click ever recorded.
CREATE INDEX idx_clicks_bot_ts ON clicks(is_bot, ts);
