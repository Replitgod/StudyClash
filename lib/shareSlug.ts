// Public addresses for shared study sets.
//
// A slug is the whole public identity of a deck: it is in the URL a student
// texts a classmate, in the canonical tag, and in Google's index. Getting it
// wrong is not a crash, it is a dead link in someone's group chat months
// later — so it is pure and tested, like the rest of lib/.
//
// Two rules drive the design:
//
//   Readable, because a bare id in a link tells the recipient nothing about
//   whether it is worth opening. "photosynthesis-k3f9q2" does.
//
//   Not guessable, because "readable" alone would make every study set on
//   the platform enumerable by trying common titles. The random suffix is
//   what stops /d/biology-unit-3 from being a lucky guess into someone
//   else's material.

/** Characters in the random suffix. No look-alikes: no 0/O, 1/l/I. */
const SUFFIX_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Length of the random half. 30^6 is ~729M, far past guessing by hand. */
const SUFFIX_LENGTH = 6;

/** Longest readable half. Keeps the whole slug comfortably under a line. */
const MAX_TITLE_LENGTH = 48;

/**
 * Words that carry no meaning in a URL. Dropped only when the title has
 * other words to spare, so a deck actually called "The Test" does not
 * slugify to nothing.
 */
const NOISE_WORDS = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "my"]);

/**
 * The readable half of a slug: lowercase, hyphenated, ASCII.
 *
 * Returns "" for a title with nothing usable in it (emoji, punctuation, or
 * a script this cannot transliterate). Callers must handle that rather than
 * emitting a slug that is just a suffix with a leading hyphen.
 */
export function slugifyTitle(title: string): string {
  const base = (title || "")
    .normalize("NFKD")
    // Strip combining marks so "Ácido" becomes "acido" rather than "cido".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!base) return "";

  const words = base.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word) => !NOISE_WORDS.has(word));
  // Only drop noise words if something survives; "The A Team" keeps "team",
  // but a title that is *entirely* noise keeps itself.
  const chosen = meaningful.length > 0 ? meaningful : words;

  let slug = "";
  for (const word of chosen) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_TITLE_LENGTH) break;
    slug = next;
  }

  // A single word longer than the cap would leave slug empty above.
  if (!slug) slug = chosen[0].slice(0, MAX_TITLE_LENGTH);

  return slug.replace(/^-+|-+$/g, "");
}

/**
 * The random half. `randomInt` is injected so tests are deterministic and
 * so the server can pass a CSPRNG instead of Math.random.
 */
export function buildSuffix(randomInt: (maxExclusive: number) => number): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

/**
 * A complete public slug for a deck.
 *
 * A title that slugifies to nothing still gets a valid address — "set-" plus
 * the suffix — rather than failing to publish. Someone whose deck is titled
 * in a script this cannot transliterate should still be able to share it.
 */
export function buildShareSlug(
  title: string,
  randomInt: (maxExclusive: number) => number
): string {
  const readable = slugifyTitle(title);
  const suffix = buildSuffix(randomInt);
  return readable ? `${readable}-${suffix}` : `set-${suffix}`;
}

/**
 * Whether a string could be a slug this module minted.
 *
 * Used to reject junk before it reaches the database on the public route,
 * so a scan for `/d/../../etc/passwd` is a 404 from a string check rather
 * than a query.
 */
export function isValidShareSlug(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64;
}
