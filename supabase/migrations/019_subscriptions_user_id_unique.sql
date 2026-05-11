-- One subscription row per user — prevents concurrent Stripe webhooks from
-- inserting duplicates (checkout.session.completed + subscription.created + updated).

-- Keep a single row per user_id: prefer active status, then newest created_at.
delete from public.subscriptions s
using (
  select id,
    row_number() over (
      partition by user_id
      order by
        case when status = 'active' then 0 else 1 end,
        created_at desc nulls last
    ) as rn
  from public.subscriptions
) ranked
where s.id = ranked.id
  and ranked.rn > 1;

drop index if exists public.subscriptions_user_id_idx;

alter table public.subscriptions
  add constraint subscriptions_user_id_key unique (user_id);
