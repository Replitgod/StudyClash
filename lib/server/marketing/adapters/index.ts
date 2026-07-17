import type { PublishingAdapter } from "./types";
import { createManualOnlyAdapter } from "./manualOnlyAdapter";
import type { DestinationPlatform } from "../constants";

// Registry of publishing adapters, one per platform that could theoretically
// support an official API (X, LinkedIn, Reddit -- the platforms with real
// public posting APIs). Every entry is the manual-only stub until real
// OAuth credentials are configured and validated -- see
// lib/server/marketing/adapters/manualOnlyAdapter.ts for why that's not
// faked. Platforms with no realistic official posting API (TikTok,
// Instagram, YouTube Shorts organic posts, directories, communities) are
// intentionally absent here -- they're manual/copy-and-open only, always.
const ADAPTER_PLATFORMS: DestinationPlatform[] = ["x", "linkedin", "reddit"];

const registry = new Map<string, PublishingAdapter>(
  ADAPTER_PLATFORMS.map((platform) => [platform, createManualOnlyAdapter(platform)])
);

export function getPublishingAdapter(platform: string): PublishingAdapter | null {
  return registry.get(platform) || null;
}

export function isApiCapablePlatform(platform: string): boolean {
  return registry.has(platform);
}
