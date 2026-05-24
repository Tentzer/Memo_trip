-- 1. Allow senders to read their own outgoing pending shares.
--    Without this, the JS duplicate-check query returned 0 rows (RLS hid them)
--    because the sender is not the receiver.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename  = 'pending_shares'
          and policyname = 'senders_can_read_own_outgoing_shares'
    ) then
        execute $policy$
            create policy senders_can_read_own_outgoing_shares
            on public.pending_shares
            for select
            to authenticated
            using (sender_id = auth.uid())
        $policy$;
    end if;
end;
$$;

-- 2. Hard unique constraint: one pending share per (memory, receiver).
--    Even if the JS check is bypassed, the DB will reject the second insert.
--    Deduplicate first so the index can be created cleanly.
delete from public.pending_shares
where id in (
    select id
    from (
        select
            id,
            row_number() over (
                partition by memory_id, receiver_email
                order by created_at asc
            ) as rn
        from public.pending_shares
        where status = 'pending'
    ) ranked
    where rn > 1
);

create unique index if not exists pending_shares_one_pending_per_receiver
    on public.pending_shares (memory_id, receiver_email)
    where status = 'pending';
