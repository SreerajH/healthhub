-- The "self" member can't be deleted on its own, but deleting the whole account must still work.
-- A cascade reaches this trigger from the parent's own delete trigger, so it runs one level deeper.
create or replace function public.protect_self_member()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old; -- cascading from a profile or account delete
  end if;
  if old.relation = 'self' then
    raise exception 'the account holder cannot be removed from the family' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function public.protect_self_member() from public, anon, authenticated;
