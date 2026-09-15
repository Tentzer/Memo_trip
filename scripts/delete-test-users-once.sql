-- One-off: delete listed test accounts and related app data.
DO $$
DECLARE
  v_emails text[] := ARRAY[
    'jonbobi@job.com',
    'lolololo@gmail.com',
    'test@test.com',
    'test@appletest.com',
    'talkrisple21@gmail.com',
    'sigalit@memo.com',
    'ronish10571@gmail.com',
    'noyz@gmail.com',
    'itayh1996@gmail.com'
  ];
  v_user_id uuid;
  v_email text;
BEGIN
  FOR v_user_id, v_email IN
    SELECT u.id, u.email
    FROM auth.users u
    WHERE lower(u.email) = ANY (SELECT lower(unnest(v_emails)))
  LOOP
    RAISE NOTICE 'Deleting user % (%)', v_email, v_user_id;

    DELETE FROM public.pending_shares
    WHERE sender_id = v_user_id
       OR lower(receiver_email) = lower(v_email);

    DELETE FROM public.library_invites
    WHERE sender_id = v_user_id
       OR lower(receiver_email) = lower(v_email);

    DELETE FROM public.market_library_downloads
    WHERE user_id = v_user_id;

    DELETE FROM public.market_photos mp
    USING public.market_libraries ml
    WHERE mp.market_library_id = ml.id
      AND ml.author_id = v_user_id;

    DELETE FROM public.market_libraries
    WHERE author_id = v_user_id;

    DELETE FROM public.library_memos lm
    USING public.memories m
    WHERE lm.memo_id = m.id
      AND m.user_id = v_user_id;

    DELETE FROM public.library_memos lm
    USING public.libraries l
    WHERE lm.library_id = l.id
      AND l.owner_id = v_user_id;

    DELETE FROM public.library_members
    WHERE user_id = v_user_id;

    DELETE FROM public.memories
    WHERE user_id = v_user_id;

    DELETE FROM public.libraries
    WHERE owner_id = v_user_id;

    DELETE FROM public.video_import_jobs
    WHERE user_id = v_user_id;

    DELETE FROM public.profiles
    WHERE id = v_user_id;

    DELETE FROM auth.users
    WHERE id = v_user_id;
  END LOOP;
END $$;
