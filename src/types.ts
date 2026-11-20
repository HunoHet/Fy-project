import type { HashtagCategory } from '@/data/hashtagCategories';

export type TabKey = 'feed' | 'reels' | 'squads' | 'messages' | 'profile';
export type Interest = HashtagCategory;

export interface Reel {
  id: number;
  contentId?: string;
  username: string;
  handle: string;
  avatar: string;
  caption: string;
  gradient: string;
  emoji: string;
  likes: number;
  inFeeds: number;
  comments: number;
  shares: number;
  tags: string[];
  audienceTags: string[];
  verified: boolean;
  hasBlueprintBadge: boolean;
  hasHypeMagnatBadge: boolean;
  mediaUrl?: string;
}

export interface FeedPost {
  id: number;
  contentId?: string;
  username: string;
  handle: string;
  avatar: string;
  image: string;
  caption: string;
  gradient: string;
  emoji: string;
  likes: number;
  comments: number;
  inFeeds: number;
  isDump?: boolean;
  squadName?: string;
  tags: string[];
  verified: boolean;
}

export interface Squad {
  id: number;
  name: string;
  members: number;
  memberProfiles: { username: string; avatar: string; handle?: string; nickname?: string }[];
  syncPoints: number;
  streak: number;
  peakStreak: number;
  matchingTopics: number;
  color: string;
  avatar: string;
}

export interface User {
  username: string;
  handle: string;
  avatar: string;
  followers: number;
  following: number;
  totalSyncPoints: number;
  inFeedVisible: boolean;
  hasBlueprintBadge: boolean;
  hasHypeMagnatBadge: boolean;
  squadPartner: { username: string; handle: string } | null;
}

export interface Comment {
  id: number | string;
  userId?: string | null;
  parentId?: number | string | null;
  username: string;
  handle: string;
  avatar: string;
  text: string;
  time: string;
  likes: number;
  likedByMe?: boolean;
}

export interface ProfileMediaContent {
  contentId?: string;
  localId: number | string;
  mediaType: 'post' | 'reel';
  mediaUrl: string;
  caption: string;
  tags: string[];
  likes: number;
  inFeeds: number;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
}

export interface DMConversation {
  id: number | string;
  username: string;
  handle: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  peerId?: string;
}

export interface ChatMessage {
  id: number | string;
  fromMe: boolean;
  system?: boolean;
  username: string;
  avatar: string;
  text: string;
  time: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: Record<string, number>;
  myReaction?: string | null;
  replyToId?: number | string;
  replyToUsername?: string;
  replyToText?: string;
}

export interface CreatorPost {
  id: number;
  contentId?: string;
  image: string;
  gradient: string;
  likes: number;
}

export interface Creator {
  id: number;
  username: string;
  handle: string;
  avatar: string;
  followers: number;
  following: number;
  syncPoints: number;
  bio: string;
  verified: boolean;
  hasBlueprintBadge: boolean;
  hasHypeMagnatBadge: boolean;
  posts: CreatorPost[];
  reels?: CreatorPost[];
}

export interface DumpReel {
  id: number;
  reelId: number;
  username: string;
  handle: string;
  avatar: string;
  caption: string;
  gradient: string;
  emoji: string;
  time: string;
  viewed: boolean;
}

export type Overlay =
  | { type: 'creator-profile'; handle: string }
  | { type: 'profile-media'; content: ProfileMediaContent }
  | { type: 'hashtag'; tag: string }
  | { type: 'group-chat'; squadId: number }
  | { type: 'dump-wall'; squadId: number; reelId?: number }
  | { type: 'dm-chat'; handle: string }
  | null;
