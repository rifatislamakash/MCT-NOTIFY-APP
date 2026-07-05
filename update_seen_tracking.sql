-- update_seen_tracking.sql
-- Run this in your Supabase SQL Editor to fix the foreign key issue

-- Drop the old foreign key constraint if it exists (pointing to auth.users)
ALTER TABLE public.item_views
  DROP CONSTRAINT IF EXISTS item_views_user_id_fkey;

-- Add the foreign key pointing to public.profiles instead
ALTER TABLE public.item_views
  ADD CONSTRAINT item_views_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE CASCADE;

-- Note: You might need to reload your schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
