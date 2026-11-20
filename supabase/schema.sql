create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username = lower(username)),
  display_name text not null default '',
  avatar_url text,
  location text not null default '',
  bio text not null default '',
  sync_points integer not null default 0 check (sync_points >= 0),
  in_feed_count integer not null default 0 check (in_feed_count >= 0),
  interests text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists interests text[] not null default '{}';
alter table public.profiles
  add column if not exists sync_points integer not null default 0 check (sync_points >= 0);
alter table public.profiles
  add column if not exists in_feed_count integer not null default 0 check (in_feed_count >= 0);

create table if not exists public.user_interests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  interests text[] not null default '{}'
);

alter table public.user_interests
  drop constraint if exists user_interests_user_id_fkey;

alter table public.user_interests
  drop constraint if exists user_interests_user_id_auth_users_fkey;

alter table public.user_interests
  add constraint user_interests_user_id_auth_users_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

insert into public.user_interests (user_id, interests)
select id, interests
from public.profiles
where cardinality(interests) > 0
on conflict (user_id) do nothing;

update public.profiles
set interests = '{}'
where cardinality(interests) > 0;

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

alter table public.messages add column if not exists edited_at timestamptz;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null constraint posts_owner_id_fkey references public.profiles (id) on delete cascade,
  media_type text not null check (media_type in ('post', 'reel')),
  media_url text not null,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 1000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check (cardinality(tags) <= 9)
);

alter table public.posts
  drop constraint if exists posts_tags_check;
alter table public.posts
  add constraint posts_tags_check check (cardinality(tags) <= 9);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  story_date date not null default ((now() at time zone 'UTC')::date),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (owner_id, story_date),
  check (expires_at > created_at)
);

create table if not exists public.story_items (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null,
  storage_path text not null unique,
  position integer not null check (position between 0 and 9),
  created_at timestamptz not null default now(),
  unique (story_id, position)
);

create table if not exists public.story_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table if not exists public.content_feedback (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  action text not null check (action in ('like', 'in_feed')),
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, action)
);

create or replace function public.refresh_profile_in_feed_count(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles profile
  set in_feed_count = (
    select count(*)::integer
    from public.posts post
    join public.content_feedback feedback on feedback.post_id = post.id
    where post.owner_id = target_profile_id
      and feedback.action = 'in_feed'
      and feedback.user_id <> target_profile_id
  )
  where profile.id = target_profile_id;
end;
$$;

revoke all on function public.refresh_profile_in_feed_count(uuid) from public, anon, authenticated;

create or replace function public.refresh_profile_in_feed_count_after_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.action = 'in_feed' then
      select owner_id into post_owner_id
      from public.posts
      where id = old.post_id;
      if post_owner_id is not null then
        perform public.refresh_profile_in_feed_count(post_owner_id);
      end if;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.action = 'in_feed' then
      select owner_id into post_owner_id
      from public.posts
      where id = old.post_id;
      if post_owner_id is not null then
        perform public.refresh_profile_in_feed_count(post_owner_id);
      end if;
    end if;
    if new.action = 'in_feed' then
      select owner_id into post_owner_id
      from public.posts
      where id = new.post_id;
      if post_owner_id is not null then
        perform public.refresh_profile_in_feed_count(post_owner_id);
      end if;
    end if;
    return new;
  end if;

  if new.action = 'in_feed' then
    select owner_id into post_owner_id
    from public.posts
    where id = new.post_id;
    if post_owner_id is not null then
      perform public.refresh_profile_in_feed_count(post_owner_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_profile_in_feed_count_after_feedback() from public, anon, authenticated;

drop trigger if exists refresh_profile_in_feed_count_on_feedback on public.content_feedback;
create trigger refresh_profile_in_feed_count_on_feedback
  after insert or update or delete on public.content_feedback
  for each row execute function public.refresh_profile_in_feed_count_after_feedback();

create or replace function public.refresh_profile_in_feed_count_after_post_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_profile_in_feed_count(old.owner_id);
  return old;
end;
$$;

revoke all on function public.refresh_profile_in_feed_count_after_post_delete() from public, anon, authenticated;

drop trigger if exists refresh_profile_in_feed_count_on_post_delete on public.posts;
create trigger refresh_profile_in_feed_count_on_post_delete
  after delete on public.posts
  for each row execute function public.refresh_profile_in_feed_count_after_post_delete();

update public.profiles profile
set in_feed_count = (
  select count(*)::integer
  from public.posts post
  join public.content_feedback feedback on feedback.post_id = post.id
  where post.owner_id = profile.id
    and feedback.action = 'in_feed'
    and feedback.user_id <> profile.id
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null constraint notifications_recipient_id_fkey references public.profiles (id) on delete cascade,
  actor_id uuid not null constraint notifications_actor_id_fkey references public.profiles (id) on delete cascade,
  type text not null check (type in ('like', 'unfollow')),
  post_id uuid constraint notifications_post_id_fkey references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null,
  handle text not null,
  avatar_url text,
  content text not null check (char_length(content) between 1 and 1000),
  parent_comment_id uuid references public.post_comments (id) on delete cascade,
  like_count integer not null default 0 check (like_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.post_comments
  add column if not exists parent_comment_id uuid references public.post_comments (id) on delete cascade;
alter table public.post_comments
  add column if not exists like_count integer not null default 0 check (like_count >= 0);

create table if not exists public.post_comment_likes (
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create or replace function public.update_post_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.post_comments
    set like_count = like_count + 1
    where id = new.comment_id;
    return new;
  end if;

  update public.post_comments
  set like_count = greatest(0, like_count - 1)
  where id = old.comment_id;
  return old;
end;
$$;

drop trigger if exists update_post_comment_like_count_after_change on public.post_comment_likes;
create trigger update_post_comment_like_count_after_change
  after insert or delete on public.post_comment_likes
  for each row execute function public.update_post_comment_like_count();

create or replace function public.protect_message_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.read_at is distinct from old.read_at
    and old.recipient_id <> auth.uid() then
    raise exception 'Only the recipient can mark a message as read';
  end if;

  if new.content is distinct from old.content then
    if auth.uid() is not null
      and (old.sender_id <> auth.uid() or old.read_at is not null) then
      raise exception 'Only the sender can edit an unread message';
    end if;
    new.edited_at := now();
  elsif new.edited_at is distinct from old.edited_at then
    raise exception 'edited_at is managed by the database';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_message_updates_before_change on public.messages;
create trigger protect_message_updates_before_change
  before update on public.messages
  for each row execute function public.protect_message_updates();

create or replace function public.notify_content_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
begin
  if new.action <> 'like' then
    return new;
  end if;

  select owner_id into post_owner
  from public.posts
  where id = new.post_id;

  if post_owner is not null and post_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (post_owner, new.user_id, 'like', new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_post_owner_after_like on public.content_feedback;
create trigger notify_post_owner_after_like
  after insert on public.content_feedback
  for each row execute function public.notify_content_like();

create or replace function public.notify_user_after_unfollow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and old.follower_id = auth.uid() then
    insert into public.notifications (recipient_id, actor_id, type)
    values (old.followee_id, old.follower_id, 'unfollow');
  end if;
  return old;
end;
$$;

drop trigger if exists notify_user_after_follow_removed on public.follows;
create trigger notify_user_after_follow_removed
  after delete on public.follows
  for each row execute function public.notify_user_after_unfollow();

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_created_idx
  on public.messages (recipient_id, created_at desc);
create index if not exists profiles_username_search_idx
  on public.profiles (username);
create index if not exists posts_owner_created_idx
  on public.posts (owner_id, created_at desc);
create index if not exists posts_tags_idx
  on public.posts using gin (tags);
create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);
create index if not exists stories_active_owner_idx
  on public.stories (owner_id, expires_at desc);
create index if not exists story_items_story_position_idx
  on public.story_items (story_id, position);
create index if not exists post_comment_likes_user_idx
  on public.post_comment_likes (user_id, comment_id);
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_username text;
  safe_username text;
  profile_name text;
begin
  raw_username := coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(coalesce(new.email, 'user'), '@', 1),
    'user'
  );
  safe_username := lower(left(regexp_replace(raw_username, '[^a-zA-Z0-9._]', '', 'g'), 24));
  if safe_username = '' then
    safe_username := 'user';
  end if;
  if exists (select 1 from public.profiles p where p.username = safe_username) then
    safe_username := left(safe_username, 17) || '_' || left(new.id::text, 6);
  end if;
  profile_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    safe_username
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    safe_username,
    profile_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.user_interests enable row level security;
alter table public.follows enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.posts enable row level security;
alter table public.stories enable row level security;
alter table public.story_items enable row level security;
alter table public.story_views enable row level security;
alter table public.content_feedback enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_comment_likes enable row level security;

grant select, insert on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, location, bio, sync_points) on public.profiles to authenticated;
grant select, insert, update on public.user_interests to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at, content, edited_at) on public.messages to authenticated;
grant delete on public.messages to authenticated;
grant select, insert, update, delete on public.message_reactions to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, delete on public.posts to authenticated;
grant select, insert, delete on public.stories to authenticated;
grant select, insert, delete on public.story_items to authenticated;
grant select, insert on public.story_views to authenticated;
grant select, insert, update, delete on public.content_feedback to authenticated;
grant select, insert, delete on public.post_comments to authenticated;
grant select, insert, delete on public.post_comment_likes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('social-media', 'social-media', true, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Authenticated users can discover profiles" on public.profiles;
create policy "Authenticated users can discover profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can read their private interests" on public.user_interests;
create policy "Users can read their private interests"
  on public.user_interests for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their private interests" on public.user_interests;
create policy "Users can create their private interests"
  on public.user_interests for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their private interests" on public.user_interests;
create policy "Users can update their private interests"
  on public.user_interests for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can read follows involving them" on public.follows;
drop policy if exists "Authenticated users can read follows" on public.follows;
create policy "Authenticated users can read follows"
  on public.follows for select to authenticated
  using (true);

drop policy if exists "Users can follow from their own account" on public.follows;
create policy "Users can follow from their own account"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and follower_id <> followee_id);

drop policy if exists "Users can unfollow from their own account" on public.follows;
create policy "Users can unfollow from their own account"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

drop policy if exists "Users can read messages they participate in" on public.messages;
create policy "Users can read messages they participate in"
  on public.messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists "Users can send messages as themselves" on public.messages;
create policy "Users can send messages as themselves"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and sender_id <> recipient_id);

drop policy if exists "Recipients can mark messages as read" on public.messages;
create policy "Recipients can mark messages as read"
  on public.messages for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "Senders can edit unread messages" on public.messages;
create policy "Senders can edit unread messages"
  on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and read_at is null)
  with check (sender_id = (select auth.uid()) and read_at is null);

drop policy if exists "Senders can delete their messages" on public.messages;
create policy "Senders can delete their messages"
  on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));

drop policy if exists "Participants can read message reactions" on public.message_reactions;
create policy "Participants can read message reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can add their own message reactions" on public.message_reactions;
create policy "Users can add their own message reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can update their own message reactions" on public.message_reactions;
create policy "Users can update their own message reactions"
  on public.message_reactions for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can remove their own message reactions" on public.message_reactions;
create policy "Users can remove their own message reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read their notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists "Users can mark their notifications as read" on public.notifications;
create policy "Users can mark their notifications as read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "Users can view own, followed, and relevant posts" on public.posts;
drop policy if exists "Authenticated users can discover all posts" on public.posts;
create policy "Authenticated users can discover all posts"
  on public.posts for select to authenticated
  using (true);

drop policy if exists "Users can view active stories from themselves and followed accounts" on public.stories;
create policy "Users can view active stories from themselves and followed accounts"
  on public.stories for select to authenticated
  using (
    expires_at > now()
    and (
      owner_id = (select auth.uid())
      or exists (
        select 1 from public.follows follow
        where follow.follower_id = (select auth.uid())
          and follow.followee_id = stories.owner_id
      )
    )
  );

drop policy if exists "Users can post one story per UTC day" on public.stories;
create policy "Users can post one story per UTC day"
  on public.stories for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and story_date = (now() at time zone 'UTC')::date
  );

drop policy if exists "Users can delete their own stories" on public.stories;
create policy "Users can delete their own stories"
  on public.stories for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Users can view items from accessible stories" on public.story_items;
create policy "Users can view items from accessible stories"
  on public.story_items for select to authenticated
  using (
    exists (
      select 1
      from public.stories story
      where story.id = story_items.story_id
        and story.expires_at > now()
        and (
          story.owner_id = (select auth.uid())
          or exists (
            select 1 from public.follows follow
            where follow.follower_id = (select auth.uid())
              and follow.followee_id = story.owner_id
          )
        )
    )
  );

drop policy if exists "Users can add items to their own stories" on public.story_items;
create policy "Users can add items to their own stories"
  on public.story_items for insert to authenticated
  with check (
    exists (
      select 1 from public.stories story
      where story.id = story_items.story_id
        and story.owner_id = (select auth.uid())
        and story.expires_at > now()
    )
  );

drop policy if exists "Users can delete items from their own stories" on public.story_items;
create policy "Users can delete items from their own stories"
  on public.story_items for delete to authenticated
  using (
    exists (
      select 1 from public.stories story
      where story.id = story_items.story_id
        and story.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Users can read their own story views" on public.story_views;
create policy "Users can read their own story views"
  on public.story_views for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can mark accessible stories as viewed" on public.story_views;
create policy "Users can mark accessible stories as viewed"
  on public.story_views for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.stories story
      where story.id = story_views.story_id
        and story.expires_at > now()
        and (
          story.owner_id = (select auth.uid())
          or exists (
            select 1 from public.follows follow
            where follow.follower_id = (select auth.uid())
              and follow.followee_id = story.owner_id
          )
        )
    )
  );

drop policy if exists "Users can read their own content feedback" on public.content_feedback;
create policy "Users can read their own content feedback"
  on public.content_feedback for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own content feedback" on public.content_feedback;
create policy "Users can add their own content feedback"
  on public.content_feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

drop policy if exists "Users can update their own content feedback" on public.content_feedback;
create policy "Users can update their own content feedback"
  on public.content_feedback for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their own content feedback" on public.content_feedback;
create policy "Users can remove their own content feedback"
  on public.content_feedback for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can read post comments" on public.post_comments;
create policy "Authenticated users can read post comments"
  on public.post_comments for select to authenticated
  using (true);

drop policy if exists "Users can add comments as themselves" on public.post_comments;
create policy "Users can add comments as themselves"
  on public.post_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      parent_comment_id is null
      or exists (
        select 1 from public.post_comments parent
        where parent.id = public.post_comments.parent_comment_id
          and parent.post_id = public.post_comments.post_id
      )
    )
  );

drop policy if exists "Users can delete their own comments" on public.post_comments;
create policy "Users can delete their own comments"
  on public.post_comments for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Authenticated users can read post comment likes" on public.post_comment_likes;
create policy "Authenticated users can read post comment likes"
  on public.post_comment_likes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can like comments as themselves" on public.post_comment_likes;
create policy "Users can like comments as themselves"
  on public.post_comment_likes for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their own comment likes" on public.post_comment_likes;
create policy "Users can remove their own comment likes"
  on public.post_comment_likes for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can publish their own posts" on public.posts;
create policy "Users can publish their own posts"
  on public.posts for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Anyone can view social-media files" on storage.objects;
create policy "Anyone can view social-media files"
  on storage.objects for select
  using (bucket_id = 'social-media');

drop policy if exists "Users can upload their own social-media files" on storage.objects;
create policy "Users can upload their own social-media files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own social-media files" on storage.objects;
create policy "Users can delete their own social-media files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'social-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_items'
  ) then
    alter publication supabase_realtime add table public.story_items;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
