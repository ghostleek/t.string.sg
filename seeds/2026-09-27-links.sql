-- One-off link batch. Apply with:
--   npx wrangler d1 execute t-string-sg --remote --file=seeds/2026-09-27-links.sql
-- ON CONFLICT DO NOTHING: re-running is safe and never overwrites an existing slug.
INSERT INTO links (slug, target_url, notes, created_at) VALUES
  ('math-arena',  'https://limkimsze-maker.github.io/Math-Fluency-Arena/', NULL, unixepoch()),
  ('uncle-joe',   'https://limkimsze-maker.github.io/Uncle-Joe-and-the-Key-of-Product-Main-Page/', NULL, unixepoch()),
  ('math-engine', 'https://limkimsze-maker.github.io/Primary-Math-Teaching-Engine/', NULL, unixepoch()),
  ('kimsze',      'https://limkimsze-maker.github.io/', 'Kim Sze''s portfolio', unixepoch()),
  ('plexo',       'https://seat.string.sg', NULL, unixepoch()),
  ('gryphon-lab', 'https://go.gov.sg/wnrgyt', NULL, unixepoch())
ON CONFLICT(slug) DO NOTHING;
