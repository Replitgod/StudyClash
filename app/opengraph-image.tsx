import { ImageResponse } from "next/og";

export const alt = "StudyJoust AI study battles";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

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
          padding: "56px",
          background: "radial-gradient(circle at 20% 20%, #22d3ee 0%, #051320 50%, #020617 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "28px",
            letterSpacing: "1px",
            opacity: 0.9,
          }}
        >
          <div
            style={{
              width: "18px",
              height: "18px",
              borderRadius: "999px",
              background: "#67e8f9",
            }}
          />
          StudyJoust
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "72px",
              fontWeight: 900,
              lineHeight: 1.04,
            }}
          >
            <span>Battle an AI.</span>
            <span>Study like a competitor.</span>
          </div>
          <div style={{ fontSize: "32px", opacity: 0.88 }}>
            Upload notes • Live quiz battles • Weak-topic reports
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            {["Easy", "Medium", "Hard"].map((label) => (
              <div
                key={label}
                style={{
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.35)",
                  padding: "10px 18px",
                  fontSize: "22px",
                  fontWeight: 700,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: "26px", opacity: 0.85 }}>AI Study App</div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
