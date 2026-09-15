-- Allow authenticated users to resolve share recipients by username or email via profiles.

drop policy if exists profiles_share_recipient_lookup on public.profiles;

create policy profiles_share_recipient_lookup
    on public.profiles
    as permissive
    for select
    to authenticated
    using (true);

comment on policy profiles_share_recipient_lookup on public.profiles is
    'Share invites look up recipient id/email/username from profiles.';
