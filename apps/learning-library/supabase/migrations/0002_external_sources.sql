alter type learning_source_type add value if not exists 'external_url';

alter table learning_item drop constraint if exists learning_item_platform_check;
alter table learning_item
  add constraint learning_item_platform_check
  check (platform in ('instagram', 'youtube', 'tiktok', 'vimeo', 'web', 'local', 'demo'));

comment on column learning_item.platform is 'Detected source family used for organization; URLs are not fetched by this column.';
