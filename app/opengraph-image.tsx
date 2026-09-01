import { ImageResponse } from "next/og";

export const alt = "Stockpile — an inventory platform for multi-site distributors";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0b0f0d",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#047857",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", color: "#34d399", fontSize: 28, fontWeight: 700 }}>
            Public demo · resets daily
          </div>
        </div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
          Stockpile
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            color: "#94a3a0",
            fontSize: 32,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Purchase order to shelf to shipment — the movement ledger, role permissions and audit
          trail that make the numbers defensible.
        </div>
      </div>
    ),
    { ...size },
  );
}
