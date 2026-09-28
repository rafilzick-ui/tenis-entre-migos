-- Prevent friendly matches from being scheduled in the past
ALTER TABLE friendly_matches
  ADD CONSTRAINT friendly_matches_match_date_not_past
  CHECK (match_date IS NULL OR match_date >= CURRENT_DATE);
