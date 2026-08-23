-- Allow users to delete their own marketplace download rows (required for re-download after
-- deleting a copied library). Client revoke/clear was silently deleting 0 rows without this.

CREATE POLICY "Users can delete their marketplace downloads"
ON public.market_library_downloads
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Purge stale download rows before checking duplicates; remove ON CONFLICT dead-end.
CREATE OR REPLACE FUNCTION public.download_market_library(p_market_library_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_market_library public.market_libraries%rowtype;
  v_new_library_id public.libraries.id%type;
  v_new_memory_id public.memories.id%type;
  v_photo record;
  v_photo_count integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in to download a marketplace library.';
  END IF;

  SELECT *
  INTO v_market_library
  FROM public.market_libraries
  WHERE id = p_market_library_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace library not found.';
  END IF;

  IF v_market_library.author_id = v_user_id THEN
    RAISE EXCEPTION 'You cannot download your own marketplace library.';
  END IF;

  DELETE FROM public.market_library_downloads d
  WHERE d.user_id = v_user_id
    AND d.market_library_id = p_market_library_id
    AND (
      d.downloaded_library_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.libraries l WHERE l.id = d.downloaded_library_id
      )
    );

  IF EXISTS (
    SELECT 1
    FROM public.market_library_downloads d
    INNER JOIN public.libraries l ON l.id = d.downloaded_library_id
    WHERE d.user_id = v_user_id
      AND d.market_library_id = p_market_library_id
  ) THEN
    RAISE EXCEPTION 'You have already downloaded this marketplace library.';
  END IF;

  INSERT INTO public.market_library_downloads (
    user_id,
    market_library_id
  )
  VALUES (
    v_user_id,
    p_market_library_id
  );

  SELECT count(*)
  INTO v_photo_count
  FROM public.market_photos
  WHERE market_library_id = p_market_library_id;

  IF v_photo_count = 0 THEN
    RAISE EXCEPTION 'This marketplace library has no photos.';
  END IF;

  INSERT INTO public.libraries (
    owner_id,
    name,
    cover_image_url
  )
  VALUES (
    v_user_id,
    v_market_library.name,
    v_market_library.cover_image_url
  )
  RETURNING id INTO v_new_library_id;

  UPDATE public.market_library_downloads
  SET downloaded_library_id = v_new_library_id
  WHERE user_id = v_user_id
    AND market_library_id = p_market_library_id;

  INSERT INTO public.library_members (
    library_id,
    user_id,
    role
  )
  VALUES (
    v_new_library_id,
    v_user_id,
    'owner'
  );

  FOR v_photo IN
    SELECT *
    FROM public.market_photos
    WHERE market_library_id = p_market_library_id
    ORDER BY sort_order ASC, created_at ASC
  LOOP
    INSERT INTO public.memories (
      user_id,
      image_url,
      latitude,
      longitude,
      title,
      description
    )
    VALUES (
      v_user_id,
      v_photo.image_url,
      v_photo.latitude,
      v_photo.longitude,
      v_photo.title,
      v_photo.description
    )
    RETURNING id INTO v_new_memory_id;

    INSERT INTO public.library_memos (
      library_id,
      memo_id,
      added_by
    )
    VALUES (
      v_new_library_id,
      v_new_memory_id,
      v_user_id
    );
  END LOOP;

  UPDATE public.market_libraries
  SET download_count = download_count + 1
  WHERE id = p_market_library_id;

  RETURN v_new_library_id::text;
END;
$function$;
