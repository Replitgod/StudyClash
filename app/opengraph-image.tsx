import { ImageResponse } from "next/og";

export const alt = "AceDecks — the study app that decides what you study next";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// The share card. Rendered at request time by next/og (Satori), which
// supports only a subset of CSS -- no `filter`, no `mask`, no external
// fonts unless fetched -- so the brand gradient is built from layered
// radial backgrounds rather than the blurred aurora the real site uses.
//
// Every element needs an explicit `display: flex` here: Satori has no block
// layout, and a bare div with multiple children throws rather than
// degrading.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background:
            "radial-gradient(900px circle at 12% 8%, rgba(124,106,240,0.55) 0%, rgba(5,5,6,0) 60%), radial-gradient(760px circle at 88% 30%, rgba(88,66,171,0.45) 0%, rgba(5,5,6,0) 62%), radial-gradient(600px circle at 60% 110%, rgba(255,176,32,0.28) 0%, rgba(5,5,6,0) 60%), #050506",
          color: "#eef4fb",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              width: "64px",
              height: "64px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #9B8AFF 0%, #6E56CF 52%, #4A3596 100%)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                width: "30px",
                height: "30px",
                borderRadius: "999px",
                background: "linear-gradient(160deg, #FFD166, #FF9F1C)",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 700 }}>
            <span style={{ color: "#9CC6FF" }}>Ace</span>
            <span style={{ color: "#2FD3B8" }}>Decks</span>
          </div>
        </div>

        {/* Promise */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "78px",
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-2.5px",
            }}
          >
            <span>Stop deciding what to study.</span>
            <span style={{ color: "#2FD3B8" }}>Just study.</span>
          </div>
          <div style={{ display: "flex", fontSize: "30px", color: "#a3b1c6" }}>
            It writes the material, finds what you forget, and brings it back.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: "12px" }}>
            {["Free to start, no card", "Any notes, PDF or photo", "Knows what you forgot"].map(
              (label) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.18)",
                    padding: "12px 22px",
                    fontSize: "22px",
                    color: "#c8d5e6",
                  }}
                >
                  {label}
                </div>
              )
            )}
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: "#6c7c95" }}>
            acedecks.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
