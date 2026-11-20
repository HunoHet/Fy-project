import type { FeedPost, Reel } from '@/types';
import type { PublishedContent } from '@/components/ContentPublisher';

export interface FollowedProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function numericId(id: string): number {
  return Number.parseInt(id.replace(/-/g, '').slice(0, 8), 16);
}

export function toFeedPost(item: PublishedContent): FeedPost {
  return {
    id: numericId(item.id),
    contentId: item.id,
    username: item.profiles.display_name || item.profiles.username,
    handle: item.profiles.username,
    avatar: item.profiles.avatar_url || '',
    image: item.media_url,
    caption: item.caption,
    gradient: 'from-zinc-800 to-zinc-950',
    emoji: '',
    likes: 0,
    comments: 0,
    inFeeds: 0,
    tags: item.tags.map((tag) => `#${tag}`),
    verified: false,
  };
}

export function toReel(item: PublishedContent): Reel {
  return {
    id: numericId(item.id),
    contentId: item.id,
    username: item.profiles.display_name || item.profiles.username,
    handle: item.profiles.username,
    avatar: item.profiles.avatar_url || '',
    caption: item.caption,
    gradient: 'from-zinc-800 to-zinc-950',
    emoji: '',
    likes: 0,
    inFeeds: 0,
    comments: 0,
    shares: 0,
    tags: item.tags.map((tag) => `#${tag}`),
    audienceTags: item.tags,
    verified: false,
    hasBlueprintBadge: false,
    hasHypeMagnatBadge: false,
    mediaUrl: item.media_url,
  };
}
