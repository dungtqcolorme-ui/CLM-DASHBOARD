-- Restore missing activity only from a real, successful Supabase Auth sign-in.
-- Preserve newer app-load activity; never substitute account creation/update time.
update public.profiles p
set last_seen_at = u.last_sign_in_at
from auth.users u
where u.id = p.id and p.last_seen_at is null and u.last_sign_in_at is not null;
