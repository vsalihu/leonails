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
import postgres from "postgres";
import { swatchSvg, studioSvg, svgToJpeg, type SwatchStyle } from "./lib/placeholder-art";
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

  await unit("media-placeholders", async (tx) => {
    const styles: { cat: string; alt: string; caption: string | null; style: SwatchStyle; feature?: boolean }[] = [
      { cat: "french", alt: "Placeholder artwork: almond nails with a fine white French tip", caption: "French finish", style: { backdrop: ["#EDE4D8", "#D9C6B2"], polishes: ["#E9C9BA", "#DDB7A5"], tip: "#FBF7F2" }, feature: true },
      { cat: "nude", alt: "Placeholder artwork: sheer nude almond nails", caption: "Sheer nude", style: { backdrop: ["#F3ECE3", "#E3D3C2"], polishes: ["#E2C2B0", "#D8B4A0", "#E9CDBD"] }, feature: true },
      { cat: "nail-art", alt: "Placeholder artwork: nude nails with a fine champagne line", caption: "Fine line detail", style: { backdrop: ["#2B211D", "#191512"], polishes: ["#C7A997", "#B89580", "#D9BBA8"], accent: "#A88958" }, feature: true },
      { cat: "occasion", alt: "Placeholder artwork: deep espresso glossy nails", caption: "Espresso gloss", style: { backdrop: ["#E8DDD0", "#CDB8A3"], polishes: ["#3A2A22", "#4A3329"] } },
      { cat: "nude", alt: "Placeholder artwork: soft pink-nude builder gel nails", caption: null, style: { backdrop: ["#EFE5DC", "#DCC6B6"], polishes: ["#E7C0B4", "#EBCDC3"] } },
      { cat: "french", alt: "Placeholder artwork: nude nails with a champagne French tip", caption: "Champagne tip", style: { backdrop: ["#F2EBE1", "#E0CFBD"], polishes: ["#E4C6B4"], tip: "#C9AE84" } },
      { cat: "nail-art", alt: "Placeholder artwork: nude nails with fine dark line art", caption: null, style: { backdrop: ["#EDE4D8", "#D6C2AE"], polishes: ["#E6CBBB", "#DABAA6"], accent: "#2B211D" } },
      { cat: "occasion", alt: "Placeholder artwork: muted rose nails", caption: "Muted rose", style: { backdrop: ["#2B211D", "#1F1815"], polishes: ["#B98A80", "#A97A70"] } },
    ];
    let order = 0;
    for (const [i, s] of styles.entries()) {
      const tall = i % 3 !== 1;
      const jpeg = await svgToJpeg(swatchSvg(1600, tall ? 2000 : 1600, s.style, 100 + i));
      const img = await processImage(jpeg, "gallery");
      const id = await insertMedia(tx as never, img, {
        usage: "gallery", altText: s.alt, caption: s.caption, category: s.cat, isPublished: true,
        provenance: PLACEHOLDER_PROVENANCE, isExample: true, sortOrder: order++,
      });
      if (s.feature) await tx`UPDATE media_assets SET is_featured = true WHERE id = ${id}`;
    }
    // Site imagery slots
    const site: { slot: string; alt: string; svg: string }[] = [
      { slot: "home.hero", alt: "Placeholder artwork: a fan of nude almond nails with French tips", svg: swatchSvg(1800, 2250, { backdrop: ["#EAE0D3", "#CDB7A2"], polishes: ["#E6C4B3", "#DDB5A2", "#EACFC1"], tip: "#FBF7F2" }, 42) },
      { slot: "home.intro", alt: "Placeholder artwork: the studio, a soft arch of light over a small table", svg: studioSvg(1800, 1300, 7) },
      { slot: "about.portrait", alt: "Placeholder artwork: studio interior", svg: studioSvg(1400, 1750, 12) },
      { slot: "visit.studio", alt: "Placeholder artwork: studio interior with a nail table", svg: studioSvg(1800, 1200, 21) },
    ];
    for (const s of site) {
      const img = await processImage(await svgToJpeg(s.svg), "site");
      const id = await insertMedia(tx as never, img, { usage: "site", altText: s.alt, isPublished: true, provenance: PLACEHOLDER_PROVENANCE, isExample: true });
      await tx`INSERT INTO site_images (slot, media_id) VALUES (${s.slot}, ${id}) ON CONFLICT (slot) DO NOTHING`;
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
