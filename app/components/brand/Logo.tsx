// The AceDecks mark.
//
// Drawn as SVG rather than shipped as a PNG: it has to stay crisp on a
// retina tab favicon and on a 400px hero, it sits on both the light
// marketing surface and the dark app shell, and an inline vector costs no
// extra request. The gradients are the brand -- deep blue into teal for the
// tile, amber for the bulb -- and every other colour in the product is
// derived from these three.
//
// `idPrefix` exists because SVG gradient ids are document-global: two marks
// on one page with the same ids means the second one silently steals the
// first one's fill.

type MarkProps = {
  className?: string;
  /** Unique per instance when more than one mark renders on a page. */
  idPrefix?: string;
  title?: string;
};

export function LogoMark({ className, idPrefix = "adm", title }: MarkProps) {
  const tile = `${idPrefix}-tile`;
  const bulb = `${idPrefix}-bulb`;
  const glow = `${idPrefix}-glow`;
  const cardTop = `${idPrefix}-card-top`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={tile} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4FA3F7" />
          <stop offset="0.52" stopColor="#2E7DF0" />
          <stop offset="1" stopColor="#12B39B" />
        </linearGradient>
        <linearGradient id={cardTop} x1="16" y1="26" x2="48" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4F2FF" />
        </linearGradient>
        <linearGradient id={bulb} x1="26" y1="10" x2="38" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD166" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
        <radialGradient id={glow} cx="32" cy="20" r="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD166" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFD166" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Rounded app tile */}
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${tile})`} />

      {/* The stack: three cards, deepest first, fanned to read as a deck */}
      <g>
        <rect
          x="10"
          y="37"
          width="44"
          height="14"
          rx="3.5"
          fill="#1B57BC"
          transform="rotate(-3.5 32 44)"
        />
        <rect
          x="12"
          y="32"
          width="40"
          height="14"
          rx="3.5"
          fill="#39D0B6"
          transform="rotate(-1.75 32 39)"
        />
        <rect
          x="14"
          y="27"
          width="36"
          height="14.5"
          rx="3.5"
          fill={`url(#${cardTop})`}
        />
      </g>

      {/* Bulb glow, behind the bulb so it reads as light, not a halo ring */}
      <circle cx="32" cy="19" r="13" fill={`url(#${glow})`} />

      {/* Rays */}
      <g stroke="#FFDE8A" strokeWidth="2.6" strokeLinecap="round">
        <path d="M32 4.2v3.2" />
        <path d="M21.4 8.2l1.7 2.7" />
        <path d="M42.6 8.2l-1.7 2.7" />
        <path d="M14.6 17.2l3 1.1" />
        <path d="M49.4 17.2l-3 1.1" />
      </g>

      {/* Bulb */}
      <path
        d="M32 8.8a9.6 9.6 0 0 0-5.3 17.6v1.9a1.5 1.5 0 0 0 1.5 1.5h7.6a1.5 1.5 0 0 0 1.5-1.5v-1.9A9.6 9.6 0 0 0 32 8.8Z"
        fill={`url(#${bulb})`}
      />
      {/* Filament highlight */}
      <circle cx="32" cy="15.8" r="3.1" fill="#FFF8E4" />
      {/* Screw base */}
      <rect x="27.8" y="30.2" width="8.4" height="2.2" rx="1.1" fill="#66708A" />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  /** The surface it sits on, not the colour it should be. */
  surface?: "dark" | "light";
};

// The logo artwork puts "Ace" in a deep navy, which only works on the white
// tile. On the app's dark chrome that navy is nearly invisible, so the dark
// surface gets a light blue at the same hue instead -- same identity,
// readable contrast.
export function Wordmark({ className, surface = "dark" }: WordmarkProps) {
  return (
    <span className={className} style={{ letterSpacing: "-0.03em", fontWeight: 700 }}>
      <span style={{ color: surface === "light" ? "var(--brand-ink)" : "var(--text-1)" }}>
        Ace
      </span>
      <span style={{ color: surface === "light" ? "#5842AB" : "var(--accent)" }}>
        Decks
      </span>
    </span>
  );
}

export function Logo({
  className,
  markClassName = "h-8 w-8",
  surface = "dark",
  idPrefix,
}: {
  className?: string;
  markClassName?: string;
  surface?: "dark" | "light";
  idPrefix?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className || ""}`}>
      <LogoMark className={markClassName} idPrefix={idPrefix} />
      <Wordmark className="text-[19px]" surface={surface} />
    </span>
  );
}
