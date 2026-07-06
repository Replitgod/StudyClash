import { supabase } from "@/lib/supabase";

// Wraps fetch() and automatically attaches the logged-in user's session
// token, so protected API routes (like /api/generate-questions) can
// verify who's making the request server-side.
export async function authFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, { ...init, headers });
}