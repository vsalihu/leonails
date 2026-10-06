-- Media can be a short looping video (homepage hero). Videos have one file,
-- stored at <storage_key>/video.<ext>, and no responsive variants.
ALTER TABLE media_assets ADD COLUMN kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image','video'));
ALTER TABLE media_assets ADD COLUMN mime text;
ALTER TABLE media_assets ADD COLUMN byte_size int;
ALTER TABLE media_assets ADD CONSTRAINT media_video_shape CHECK (kind = 'image' OR (mime IN ('video/mp4','video/webm') AND usage = 'site'));
