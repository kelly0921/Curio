-- Keep the canonical fingerprint unchanged inside record_json. Only namespace
-- the searchable unique projection so two users can save the same source.
update learning_item
set source_fingerprint = profile_id::text || ':' || source_fingerprint
where length(source_fingerprint) = 64
  and position(':' in source_fingerprint) = 0;
