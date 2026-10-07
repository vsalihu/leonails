/**
 * Seeds editable example content into the real data model.
 *
 * - Every seed unit runs at most once (tracked in seed_markers), so re-running
 *   never duplicates records or overwrites/resurrects anything the owner edited
 *   or deleted.
 * - Seeded rows carry is_example = true so they can be found and replaced.
 * - Prices, durations, hours and copy are EXAMPLES, not approved business rules.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { leopardSvg } from "./lib/placeholder-art";
import { markPlaceholder, rasterTile, renderStillLife, type StillLife, type Swatch } from "./lib/still-life";

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
import { processImage, insertMedia } from "../src/lib/server/images";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, onnotice: () => {} });
type Tx = postgres.TransactionSql;

async function unit(name: string, fn: (tx: Tx) => Promise<void>) {
  await sql.begin(async (tx) => {
    const [done] = await tx`SELECT 1 FROM seed_markers WHERE name = ${name}`;
    if (done) return;
    await fn(tx);
    await tx`INSERT INTO seed_markers (name) VALUES (${name})`;
    console.log(`seeded: ${name}`);
  });
}

const OWNER_PROVENANCE =
  "Rugile's own work. Photo supplied by the owner (October 2026); metadata removed. Confirm the client is happy for it to be published.";

const PLACEHOLDER_PROVENANCE =
  "Generated placeholder artwork (created locally, no third-party licence). Not Rugile's work. Replace with Rugile's own photography.";

async function main() {
  await unit("settings", async (tx) => {
    await tx`
      INSERT INTO business_settings (id, business_name, public_location, contact_email, notification_email, contact_phone, instagram_handle, is_example)
      VALUES (1, 'Rugile Nail Atelier', 'Wisbech', NULL, NULL, NULL, NULL, true)
      ON CONFLICT (id) DO NOTHING`;
    await tx`
      INSERT INTO private_location (id, address_lines, postcode, arrival_instructions, is_example)
      VALUES (1, 'PLACEHOLDER ADDRESS: replace with the real appointment address in Admin > Settings before launch.', NULL,
              'PLACEHOLDER: add parking and arrival instructions.', true)
      ON CONFLICT (id) DO NOTHING`;
  });

  await unit("content", async (tx) => {
    const blocks: [string, string | null, string][] = [
      ["home.hero", "Beautiful nails. Considered detail.", "Gel, builder gel and nail art by appointment in Wisbech."],
      ["home.intro", "A small studio with time for the details", "I'm Rugile. Every appointment is one-to-one, unhurried and finished with care, from a clean nude to fine nail art. This introduction is placeholder text: edit it in Admin > Settings."],
      ["home.visit", "Visit", "Based in Wisbech. Your appointment address will be provided once your booking is confirmed."],
      ["about.body", "About Rugile", "This is placeholder copy for the About page. Tell clients about your approach, the products you use and what to expect from a visit. Edit it in Admin > Settings > Website copy."],
      ["about.studio", "The studio", "Placeholder: describe the studio, accessibility, parking and what clients should bring."],
      ["treatments.intro", "Treatments and prices", "Prices below are examples and will be confirmed before launch. Extras are added to your treatment when you book."],
      ["treatments.removal", "Removal", "If you're wearing gel or builder gel from another salon, add 'Removal of existing product' so enough time is booked. Removal of my own work is included in an infill."],
    ];
    for (const [key, title, body] of blocks) {
      await tx`INSERT INTO content_blocks (key, title, body, is_example) VALUES (${key}, ${title}, ${body}, true) ON CONFLICT (key) DO NOTHING`;
    }
  });

  await unit("policies", async (tx) => {
    const policies: [string, string][] = [
      ["cancellation", "EXAMPLE POLICY: confirm with Rugile before launch.\n\nYou can cancel or move your appointment online up to 24 hours before it starts, using the link in your confirmation email. Within 24 hours, please get in touch directly.\n\nIf you're running late, please let me know. Arriving more than 15 minutes late may mean your treatment has to be shortened or rebooked."],
      ["privacy", "EXAMPLE NOTICE: review before launch.\n\nWhen you book, your name, email address and phone number are used to manage your appointment and send booking emails. They are stored securely and are not shared or sold. Photos are only published with your consent. To ask for your data to be corrected or deleted, get in touch."],
      ["booking_terms", "EXAMPLE TERMS: confirm with Rugile before launch.\n\nPayment is taken at your appointment. No deposit is needed to book. Prices shown at booking are the prices you pay, including any extras you choose. One offer can be used per booking."],
    ];
    for (const [kind, body] of policies) {
      await tx`INSERT INTO policies (kind, version, body, is_example) VALUES (${kind}, 1, ${body}, true) ON CONFLICT DO NOTHING`;
    }
  });

  await unit("technician-and-hours", async (tx) => {
    const [t] = await tx`INSERT INTO technicians (name, is_default) VALUES ('Rugile', true) RETURNING id`;
    // Example week (ISO weekday): Tue-Fri 09:30-17:30 with lunch, Sat 09:00-15:00.
    const rows: [number, string, string][] = [
      [2, "09:30", "13:00"], [2, "13:45", "17:30"],
      [3, "09:30", "13:00"], [3, "13:45", "17:30"],
      [4, "11:00", "14:00"], [4, "14:45", "20:00"],
      [5, "09:30", "13:00"], [5, "13:45", "17:30"],
      [6, "09:00", "15:00"],
    ];
    for (const [weekday, s, e] of rows) {
      await tx`INSERT INTO working_hours (technician_id, weekday, start_time, end_time, is_example) VALUES (${t.id}, ${weekday}, ${s}, ${e}, true)`;
    }
  });

  await unit("catalogue", async (tx) => {
    const [gel] = await tx`INSERT INTO treatment_categories (slug, name, sort_order, is_example) VALUES ('gel', 'Gel and builder gel', 1, true) RETURNING id`;
    const [care] = await tx`INSERT INTO treatment_categories (slug, name, sort_order, is_example) VALUES ('removal', 'Removal', 2, true) RETURNING id`;
    const treatments = [
      { slug: "gel-manicure", cat: gel.id, name: "Gel manicure", price: 3000, dur: 60, featured: true, sort: 1,
        desc: "Cuticle care, shaping and a long-wearing gel colour of your choice.", notes: null },
      { slug: "builder-gel-overlay", cat: gel.id, name: "Builder gel overlay", price: 3800, dur: 75, featured: true, sort: 2,
        desc: "A strengthening builder gel layer over your natural nails, finished in colour or a sheer nude.", notes: null },
      { slug: "builder-gel-infill", cat: gel.id, name: "Builder gel infill", price: 3500, dur: 75, featured: true, sort: 3,
        desc: "Maintenance for existing builder gel done here, including removal of the grown-out colour.", notes: "For builder gel applied at this studio within the last 4 weeks." },
      { slug: "removal-only", cat: care.id, name: "Removal only", price: 1500, dur: 30, featured: false, sort: 1,
        desc: "Gentle removal of gel or builder gel with a tidy and nourishing finish.", notes: null },
    ];
    const ids: Record<string, number> = {};
    for (const t of treatments) {
      const [r] = await tx`
        INSERT INTO treatments (slug, category_id, name, description, notes, price_pence, duration_minutes, is_featured, sort_order, is_example)
        VALUES (${t.slug}, ${t.cat}, ${t.name}, ${t.desc}, ${t.notes}, ${t.price}, ${t.dur}, ${t.featured}, ${t.sort}, true) RETURNING id`;
      ids[t.slug] = r.id;
    }
    const extras = [
      { slug: "french-finish", name: "French finish", price: 500, dur: 15, sort: 1, desc: "A fine white or nude French tip." },
      { slug: "simple-nail-art", name: "Simple nail art", price: 500, dur: 15, sort: 2, desc: "Minimal details such as dots, lines or a single accent nail." },
      { slug: "removal-existing", name: "Removal of existing product", price: 500, dur: 15, sort: 3, desc: "Needed if you're wearing gel or builder gel from elsewhere." },
    ];
    const extraIds: Record<string, number> = {};
    for (const e of extras) {
      const [r] = await tx`
        INSERT INTO extras (slug, name, description, price_pence, duration_minutes, sort_order, is_example)
        VALUES (${e.slug}, ${e.name}, ${e.desc}, ${e.price}, ${e.dur}, ${e.sort}, true) RETURNING id`;
      extraIds[e.slug] = r.id;
    }
    const links: [string, string[]][] = [
      ["gel-manicure", ["french-finish", "simple-nail-art", "removal-existing"]],
      ["builder-gel-overlay", ["french-finish", "simple-nail-art", "removal-existing"]],
      ["builder-gel-infill", ["french-finish", "simple-nail-art"]],
    ];
    for (const [t, es] of links) for (const e of es) await tx`INSERT INTO treatment_extras (treatment_id, extra_id) VALUES (${ids[t]}, ${extraIds[e]})`;
  });

  await unit("promotion-welcome20", async (tx) => {
    await tx`
      INSERT INTO promotions (name, code, application, discount_type, percent_off, eligibility, applies_to_all_treatments,
        applies_to_extras, per_customer_limit, show_on_site, banner_text, is_example)
      VALUES ('First visit 20% off', 'WELCOME20', 'code', 'percent', 20, 'first_visit', true, true, 1, true,
              'First visit? Use code WELCOME20 for 20% off your treatment.', true)`;
  });

  // Rugile's own photographs (content/gallery). Real work, not examples.
  // Runs before the placeholder unit; on databases that already have
  // placeholders it takes over their gallery and website slots.
  await unit("owner-gallery-2026-10", async (tx) => {
    const photos: { file: string; cat: string; alt: string; caption: string; featured: boolean; focal: [number, number]; slots?: string[] }[] = [
      { file: "chocolate-caramel-marble.jpg", cat: "nail-art", featured: true, focal: [48, 58], slots: ["home.hero"],
        caption: "Chocolate and caramel marble",
        alt: "Square nails in glossy chocolate brown, with caramel marble and gold flecks on the accent nails" },
      { file: "sheer-pink-gel.jpg", cat: "nude", featured: true, focal: [45, 62], slots: ["home.intro"],
        caption: "Sheer pink gel",
        alt: "Short square nails in a glossy sheer pink gel, hands resting one over the other" },
      { file: "soft-pink-3d-flowers.jpg", cat: "nail-art", featured: true, focal: [40, 58], slots: ["about.portrait"],
        caption: "Soft pink with 3D flowers",
        alt: "Milky pink square nails with raised pink 3D flowers and tiny gold beads" },
      { file: "white-french-silver-flower.jpg", cat: "french", featured: true, focal: [35, 66], slots: ["visit.studio"],
        caption: "White French with a silver flower",
        alt: "Square white French tips on a pink base, one nail with a black and silver line flower" },
      { file: "white-french-silver-charms.jpg", cat: "occasion", featured: false, focal: [50, 55],
        caption: "French with silver charms",
        alt: "White French tips with silver cross charms, studs and beaded detail on the accent nails" },
      { file: "baby-blue-french-hibiscus.jpg", cat: "french", featured: false, focal: [45, 62],
        caption: "Baby blue French with hibiscus",
        alt: "Square nails with baby blue French tips and a white hibiscus flower on one nail" },
    ];
    const dir = path.join(process.cwd(), "content", "gallery");
    const available = photos.filter((ph) => existsSync(path.join(dir, ph.file)));
    if (available.length === 0) return;
    let order = 0;
    for (const ph of available) {
      const img = await processImage(readFileSync(path.join(dir, ph.file)), "gallery");
      const id = await insertMedia(tx as never, img, {
        usage: "gallery", altText: ph.alt, caption: ph.caption, category: ph.cat, isPublished: true,
        provenance: OWNER_PROVENANCE, isExample: false, sortOrder: order++,
      });
      await tx`UPDATE media_assets SET is_featured = ${ph.featured}, focal_x = ${ph.focal[0]}, focal_y = ${ph.focal[1]} WHERE id = ${id}`;
      for (const slot of ph.slots ?? []) {
        // Take over a slot only if it is empty or still showing example artwork.
        await tx`
          INSERT INTO site_images (slot, media_id) VALUES (${slot}, ${id})
          ON CONFLICT (slot) DO UPDATE SET media_id = EXCLUDED.media_id
          WHERE site_images.media_id IS NULL
             OR site_images.media_id IN (SELECT m.id FROM media_assets m WHERE m.is_example)`;
      }
    }
    // Real work replaces placeholder artwork in the gallery.
    await tx`UPDATE media_assets SET is_published = false WHERE usage = 'gallery' AND is_example`;
  });

  await unit("media-placeholders", async (tx) => {
    // Rendered still lifes: glossy almond nails on draped satin (some leopard-printed).
    const leopardLight = await rasterTile(leopardSvg({ ground: "#d9c2a8", ink: "#2e211b", centre: "#b08d72", seed: 31, size: 640 }), 640, 1.4);
    const leopardDark = await rasterTile(leopardSvg({ ground: "#3a2a22", ink: "#120c09", centre: "#5e4535", seed: 47, size: 640 }), 640, 1.4);
    type Nail = Omit<Swatch, "cx" | "cy" | "rx" | "ry" | "angle">;
    const cascade = (n: Nail, k = 3): Swatch[] =>
      [
        { cx: 0.36, cy: 0.42, angle: -0.5 },
        { cx: 0.52, cy: 0.5, angle: -0.15 },
        { cx: 0.66, cy: 0.62, angle: 0.3 },
        { cx: 0.44, cy: 0.7, angle: 0.75 },
      ].slice(0, k).map((p) => ({ ...p, rx: 0.06, ry: 0.15, ...n }));
    const single = (n: Nail): Swatch[] => [{ cx: 0.55, cy: 0.52, rx: 0.075, ry: 0.19, angle: -0.35, ...n }];
    const render = async (w: number, h: number, seed: number, scene: Omit<StillLife, "width" | "height" | "seed">) =>
      markPlaceholder(await renderStillLife({ width: w, height: h, seed, ...scene }), w, h, luminance(scene.fabric) < 0.35);

    const gallery: { cat: string; alt: string; caption: string | null; feature?: boolean; tall: boolean; scene: Omit<StillLife, "width" | "height" | "seed"> }[] = [
      { cat: "french", alt: "Placeholder artwork: almond nails with a fine white French tip on leopard silk", caption: "French finish", feature: true, tall: true,
        scene: { fabric: "#d6bfa6", sheen: "#fff1e2", foldFrequency: 0.7, print: { ...leopardLight, scale: 1.35, strength: 0.85 }, swatches: cascade({ color: "#e3c1b2", tip: "#f7f1eb" }) } },
      { cat: "nude", alt: "Placeholder artwork: sheer nude almond nails on ivory satin", caption: "Sheer nude", feature: true, tall: false,
        scene: { fabric: "#ece2d6", sheen: "#ffffff", foldFrequency: 0.8, swatches: cascade({ color: "#e2c0ae" }, 4) } },
      { cat: "nail-art", alt: "Placeholder artwork: nude nails with a fine gold line on espresso satin", caption: "Fine line detail", feature: true, tall: true,
        scene: { fabric: "#22170f", sheen: "#f0d2b8", foldFrequency: 0.8, swatches: cascade({ color: "#d8b8a3", accent: "#b8955c" }) } },
      { cat: "occasion", alt: "Placeholder artwork: gold chrome almond nails on ivory satin", caption: "Gold chrome", tall: true,
        scene: { fabric: "#efe6da", sheen: "#ffffff", foldFrequency: 0.75, swatches: cascade({ color: "#b39066", metallic: true }) } },
      { cat: "nude", alt: "Placeholder artwork: a single soft pink-nude nail on blush satin", caption: null, tall: false,
        scene: { fabric: "#e3c9bc", sheen: "#fff4ee", foldFrequency: 0.6, swatches: single({ color: "#e7c0b4" }) } },
      { cat: "french", alt: "Placeholder artwork: nude nails with a champagne French tip on dark leopard silk", caption: "Champagne tip", tall: true,
        scene: { fabric: "#3a2a22", sheen: "#e9cbb2", foldFrequency: 0.7, print: { ...leopardDark, scale: 1.3, strength: 0.8 }, swatches: cascade({ color: "#e4c6b4", tip: "#c9ae84" }) } },
      { cat: "occasion", alt: "Placeholder artwork: deep espresso glossy nails on cream satin", caption: "Espresso gloss", tall: false,
        scene: { fabric: "#e9dccb", sheen: "#ffffff", foldFrequency: 0.7, swatches: cascade({ color: "#3a2620" }) } },
      { cat: "nail-art", alt: "Placeholder artwork: muted rose nails with a fine dark line on leopard silk", caption: "Muted rose", tall: true,
        scene: { fabric: "#d6bfa6", sheen: "#fff1e2", foldFrequency: 0.65, print: { ...leopardLight, scale: 1.6, strength: 0.8 }, swatches: cascade({ color: "#b98a80", accent: "#2b211d" }) } },
    ];
    const [{ real }] = await tx`SELECT count(*)::int AS real FROM media_assets WHERE usage = 'gallery' AND NOT is_example`;
    let order = 0;
    for (const [i, g] of (real > 0 ? [] : gallery).entries()) {
      const [w, h] = g.tall ? [1280, 1600] : [1400, 1400];
      const img = await processImage(await render(w, h, 100 + i, g.scene), "gallery");
      const id = await insertMedia(tx as never, img, {
        usage: "gallery", altText: g.alt, caption: g.caption, category: g.cat, isPublished: true,
        provenance: PLACEHOLDER_PROVENANCE, isExample: true, sortOrder: order++,
      });
      if (g.feature) await tx`UPDATE media_assets SET is_featured = true WHERE id = ${id}`;
    }

    const site: { slot: string; alt: string; w: number; h: number; scene: Omit<StillLife, "width" | "height" | "seed"> }[] = [
      { slot: "home.hero", alt: "Placeholder artwork: glossy almond nails with French tips resting on leopard silk", w: 1600, h: 2000,
        scene: { fabric: "#d6bfa6", sheen: "#fff1e2", foldFrequency: 0.6, print: { ...leopardLight, scale: 1.7, strength: 0.82 }, swatches: cascade({ color: "#e3c1b2", tip: "#f7f1eb" }, 4) } },
      { slot: "home.intro", alt: "Placeholder artwork: a single nude nail on draped ivory satin", w: 1800, h: 1350,
        scene: { fabric: "#ece2d6", sheen: "#ffffff", foldFrequency: 0.55, swatches: [{ cx: 0.6, cy: 0.5, rx: 0.07, ry: 0.18, angle: -0.9, color: "#e2c0ae" }] } },
      { slot: "about.portrait", alt: "Placeholder artwork: gold chrome nails on cream satin", w: 1400, h: 1750,
        scene: { fabric: "#e9dccb", sheen: "#ffffff", foldFrequency: 0.6, swatches: cascade({ color: "#b39066", metallic: true }) } },
      { slot: "visit.studio", alt: "Placeholder artwork: espresso satin with nude nails", w: 1800, h: 1200,
        scene: { fabric: "#22170f", sheen: "#f0d2b8", foldFrequency: 0.6, swatches: cascade({ color: "#d8b8a3" }) } },
    ];
    for (const [i, st] of site.entries()) {
      const img = await processImage(await render(st.w, st.h, 200 + i, st.scene), "site");
      const id = await insertMedia(tx as never, img, { usage: "site", altText: st.alt, isPublished: true, provenance: PLACEHOLDER_PROVENANCE, isExample: true });
      await tx`INSERT INTO site_images (slot, media_id) VALUES (${st.slot}, ${id}) ON CONFLICT (slot) DO NOTHING`;
    }
  });

  await unit("example-testimonials", async (tx) => {
    const items: [string, string, number, string | null][] = [
      ["Aiste", "My builder gel lasted four weeks without a single chip, and the shape was exactly what I asked for.", 5, "nude"],
      ["Hannah", "Calm, careful and on time. The French tips were finer than anywhere I've been before.", 5, "french"],
      ["Priya", "I came in for something simple for a wedding and left with the prettiest nails I've had.", 5, null],
    ];
    let order = 0;
    for (const [name, quote, rating, cat] of items) {
      let mediaId: number | null = null;
      if (cat) {
        const [m] = await tx`SELECT id FROM media_assets WHERE usage = 'gallery' AND category = ${cat} AND is_example ORDER BY id LIMIT 1`;
        mediaId = m?.id ?? null;
      }
      await tx`
        INSERT INTO testimonials (display_name, quote, rating, media_id, source, status, is_featured, consent_note, is_example, sort_order, moderated_at)
        VALUES (${name}, ${quote}, ${rating}, ${mediaId}, 'admin', 'approved', true,
                'EXAMPLE testimonial written for layout purposes. Not a real customer review. Remove before launch.', true, ${order++}, now())`;
    }
  });
}

main()
  .then(() => sql.end())
  .then(() => {
    console.log("seed complete");
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
