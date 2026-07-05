-- 1. Create the `item_views` table
CREATE TABLE IF NOT EXISTS item_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('notice', 'schedule', 'material', 'group', 'poll')),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()),
    
    -- Ensure a user can only view an item once
    UNIQUE (item_id, user_id)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE item_views ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Anyone can view the view counts and who viewed what
CREATE POLICY "Anyone can select item_views" 
ON item_views FOR SELECT 
USING (true);

-- Authenticated users can only insert their own view
CREATE POLICY "Users can insert their own view" 
ON item_views FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 4. Create RPC Function to gracefully mark an item as seen
-- This uses ON CONFLICT DO NOTHING so calling it multiple times doesn't error
CREATE OR REPLACE FUNCTION mark_as_seen(p_item_id UUID, p_item_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as the definer to allow insertion if needed, though RLS still applies based on auth context if not bypass RLS
AS $$
BEGIN
    INSERT INTO item_views (item_id, item_type, user_id)
    VALUES (p_item_id, p_item_type, auth.uid())
    ON CONFLICT (item_id, user_id) DO NOTHING;
END;
$$;
