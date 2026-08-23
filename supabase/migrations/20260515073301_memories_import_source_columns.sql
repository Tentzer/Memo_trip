-- Canonical import provenance lives on memories only.

alter table public.memories
    add column if not exists source text,
    add column if not exists source_url text;

comment on column public.memories.source is 'Import origin, e.g. video_import';
comment on column public.memories.source_url is 'Original pasted social/video URL';

-- Remove redundant snapshot columns if they were added in an earlier iteration (no-op if absent).

alter table public.pending_shares drop column if exists source;
alter table public.pending_shares drop column if exists source_url;

-- Accept single-memo share by copying from the sender memo row (recipient cannot SELECT owner rows under typical RLS).

create or replace function public.accept_pending_memo_share(p_invite_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    inv public.pending_shares%rowtype;
    src public.memories%rowtype;
    v_email text;
begin
    select email into v_email from public.profiles where id = auth.uid();
    if v_email is null then
        return jsonb_build_object('ok', false, 'error', 'profile_missing');
    end if;

    select * into inv
    from public.pending_shares
    where id::text = trim(p_invite_id)
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'invite_not_found');
    end if;

    if inv.status is distinct from 'pending' then
        return jsonb_build_object('ok', false, 'error', 'invite_not_pending');
    end if;

    if inv.receiver_email is distinct from v_email then
        return jsonb_build_object('ok', false, 'error', 'not_recipient');
    end if;

    select * into src from public.memories where id = inv.memory_id;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'source_memo_missing');
    end if;

    if inv.sender_id is null or src.user_id is distinct from inv.sender_id then
        return jsonb_build_object('ok', false, 'error', 'invite_sender_mismatch');
    end if;

    if src.deleted_at is not null then
        return jsonb_build_object('ok', false, 'error', 'source_memo_archived');
    end if;

    insert into public.memories (
        user_id,
        image_url,
        latitude,
        longitude,
        title,
        description,
        source,
        source_url
    )
    values (
        auth.uid(),
        src.image_url,
        src.latitude,
        src.longitude,
        src.title,
        src.description,
        src.source,
        src.source_url
    );

    delete from public.pending_shares where id = inv.id;

    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.accept_pending_memo_share(text) to authenticated;

comment on function public.accept_pending_memo_share(text) is
    'Accept single-memo pending_shares invite: copy canonical fields from sender memo, then delete invite.';
