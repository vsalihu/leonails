import { ImageResponse } from "next/og";
import { brandFonts, businessName, leopardDataUrl } from "@/lib/server/brand-assets";

export const alt = "Nail atelier in Wisbech, by appointment";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage() {
  const [name, fonts, leopard] = await Promise.all([businessName(), brandFonts(), leopardDataUrl()]);
  const [first, ...rest] = name.split(" ");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F7F3EC", color: "#2B211D", fontFamily: "Bodoni" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px" }}>
          <div style={{ fontSize: 30, letterSpacing: 12, textTransform: "uppercase", color: "#7A5F35" }}>{rest.join(" ") || "Nail Atelier"}</div>
          <div style={{ fontSize: 150, lineHeight: 1, marginTop: 18 }}>{first}</div>
          <div style={{ fontSize: 46, fontStyle: "italic", marginTop: 26 }}>Beautiful nails. Considered detail.</div>
          <div style={{ fontSize: 28, marginTop: 34, color: "#6B5A4E" }}>Wisbech, by appointment</div>
        </div>
        <div style={{ width: 300, height: "100%", display: "flex", backgroundImage: `url(${leopard})`, backgroundSize: "200px 200px" }} />
      </div>
    ),
    { ...size, fonts },
  );
}
