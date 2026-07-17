// Publishing adapter interface. Real platform adapters (Phase 2) implement
// this against an official, approved API using stored OAuth credentials.
// Never bypass CAPTCHAs, authentication, moderation, or rate limits --
// an adapter that can't do this honestly must report itself as
// not-connected/manual-only rather than fake a successful publish.
export interface PublishingAdapter {
  platform: string;
  validateConnection(): Promise<boolean>;
  publishPost(input: {
    title?: string;
    text: string;
    mediaUrls?: string[];
    scheduledAt?: string;
  }): Promise<{
    success: boolean;
    externalPostId?: string;
    externalUrl?: string;
    error?: string;
  }>;
}
