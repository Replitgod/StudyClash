// Thin wrapper around Tavily's search REST API. Server-only -- the API key
// must never reach the client. Used by app/api/find-resources/route.ts to
// ground VYRA's resource recommendations in real, live search results
// instead of the model's static training-data knowledge.

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

export async function tavilySearch(args: {
  query: string;
  maxResults?: number;
}): Promise<{ results: TavilySearchResult[] } | { error: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { error: "Resource search is not configured right now." };
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: args.query,
        search_depth: "advanced",
        max_results: args.maxResults ?? 8,
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return { error: `Search provider returned ${response.status}.` };
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };

    const results: TavilySearchResult[] = Array.isArray(data.results)
      ? data.results
          .filter((row) => typeof row.title === "string" && typeof row.url === "string")
          .map((row) => ({
            title: String(row.title),
            url: String(row.url),
            content: typeof row.content === "string" ? row.content.slice(0, 600) : "",
            score: typeof row.score === "number" ? row.score : 0,
          }))
      : [];

    return { results };
  } catch {
    return { error: "Could not reach the search provider right now." };
  }
}
