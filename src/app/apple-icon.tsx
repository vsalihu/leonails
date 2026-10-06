import { ImageResponse } from "next/og";
import { brandFonts, businessName } from "@/lib/server/brand-assets";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function AppleIcon() {
  const initial = (await businessName()).trim().charAt(0).toUpperCase() || "R";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F3EC", color: "#2B211D", fontFamily: "Bodoni", fontSize: 128, paddingBottom: 10 }}>
        {initial}
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
