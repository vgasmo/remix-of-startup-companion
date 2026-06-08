-- Fix 1: Allow uploaders to read their own booking files (first folder segment = auth.uid())
CREATE POLICY "Users can read their own booking uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Fix 2: Remove unit_economics_values from Realtime publication.
-- Financial metrics (CAC, LTV, churn, ARPU) should not be broadcast; the table
-- is not consumed via Realtime anywhere in the codebase.
ALTER PUBLICATION supabase_realtime DROP TABLE public.unit_economics_values;