-- Keep the canonical fingerprint unchanged inside record_json. Only namespace
-- the searchable unique projection so two users can save the same source.
UPDATE learning_item
SET source_fingerprint = profile_id || ':' || source_fingerprint
WHERE length(source_fingerprint) = 64
  AND instr(source_fingerprint, ':') = 0;
