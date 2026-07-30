ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin'));
