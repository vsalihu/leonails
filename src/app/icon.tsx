import { ImageResponse } from "next/og";
import { brandFonts, businessName } from "@/lib/server/brand-assets";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon() {
  const initial = (await businessName()).trim().charAt(0).toUpperCase() || "R";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2B211D", color: "#F7F3EC", fontFamily: "Bodoni", fontSize: 50, paddingBottom: 4 }}>
        {initial}
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  );
}
