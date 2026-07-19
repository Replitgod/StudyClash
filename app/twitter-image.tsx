import { ImageResponse } from "next/og";

export const alt = "AcedIQ Battle an AI";
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
          justifyContent: "center",
          background: "linear-gradient(135deg, #052538 0%, #0f172a 55%, #1f2937 100%)",
          padding: "68px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: "30px", opacity: 0.9, marginBottom: "20px" }}>AcedIQ</div>
        <div style={{ fontSize: "78px", lineHeight: 1.04, fontWeight: 900 }}>Battle an AI instantly</div>
        <div style={{ marginTop: "20px", fontSize: "34px", opacity: 0.88 }}>
          Quizlet alternative for competitive studying
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
