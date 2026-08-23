-- Delete owned memo: hard-delete row when no other user depends on it; otherwise soft-archive.

create or replace function public.delete_owned_memory(p_memory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_memory public.memories%rowtype;
  v_has_other_members boolean;
  v_has_pending boolean;
  v_has_market boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select *
  into v_memory
  from public.memories
  where id = p_memory_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_memory.user_id <> v_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  if v_memory.deleted_at is not null then
    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;

  select exists (
    select 1
    from public.library_memos lm
    inner join public.library_members m on m.library_id = lm.library_id
    where lm.memo_id = p_memory_id
      and m.user_id <> v_memory.user_id
  )
  into v_has_other_members;

  select exists (
    select 1
    from public.pending_shares ps
    where ps.memory_id = p_memory_id
      and (
        ps.status = 'pending'
        or ps.status like 'library_invite:%'
      )
  )
  into v_has_pending;

  select exists (
    select 1
    from public.market_photos mp
    where mp.source_memory_id = p_memory_id
  )
  into v_has_market;

  if v_has_other_members or v_has_pending or v_has_market then
    update public.memories
    set deleted_at = timezone('utc', now())
    where id = p_memory_id
      and user_id = v_user_id;

    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;

  delete from public.library_memos
  where memo_id = p_memory_id;

  delete from public.pending_shares
  where memory_id = p_memory_id;

  delete from public.memories
  where id = p_memory_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'mode', 'deleted',
    'image_url', v_memory.image_url
  );
end;
$$;

grant execute on function public.delete_owned_memory(uuid) to authenticated;

comment on function public.delete_owned_memory(uuid) is
  'Owner deletes a memo: hard-delete when no collaborators, invites, or marketplace refs; else set deleted_at.';
