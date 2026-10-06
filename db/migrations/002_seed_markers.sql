-- Records which seed units have been applied, so re-running the seed never
-- duplicates content or resurrects example records the owner deleted.
CREATE TABLE seed_markers (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
