---
name: awesome-design
description: Library of 74 ready-made DESIGN.md design-system specs (colors, typography, spacing, components, motion) inspired by real brands' websites. Use when the user wants a UI that looks like a specific brand or site (e.g. "make it look like Stripe/Linear/Apple"), wants a design system to start from, or asks for design direction references.
---

# Awesome DESIGN.md

Source: https://github.com/VoltAgent/awesome-design-md (MIT).

Each file in `designs/` is a DESIGN.md: a plain-text design system with tokens (colors, type scale, radii, spacing), component rules and layout patterns taken from a real website.

## How to use

1. Choose the design that fits the user's request. If they name a brand, use that one. If they describe a feel ("minimal dev tool", "luxury automotive", "playful fintech"), suggest 2–3 matching designs and confirm before you start.
2. Read `designs/<name>.md` in full before writing any UI code.
3. When the project should keep this look, copy the file into the project root as `DESIGN.md` and treat it as the source of truth for visual decisions.
4. Turn its tokens into the project's styling layer (CSS custom properties, Tailwind theme, etc.) and follow its component and layout rules.
5. Use the designs as inspiration. Don't copy proprietary logos, trademarks or brand assets, and swap in freely available fonts when the spec names proprietary ones (it usually lists fallbacks).

## Available designs

airbnb, airtable, apple, binance, bmw-m, bmw, bugatti, cal, claude, clay, clickhouse, cohere, coinbase, composio, cursor, dell-1996, elevenlabs, expo, ferrari, figma, framer, hashicorp, hp, ibm, intercom, kraken, lamborghini, linear.app, lovable, mastercard, meta, minimax, mintlify, miro, mistral.ai, mongodb, nike, nintendo-2001, notion, nvidia, ollama, opencode.ai, pinterest, playstation, posthog, raycast, renault, replicate, resend, revolut, runwayml, sanity, sentry, shopify, slack, spacex, spotify, starbucks, stripe, supabase, superhuman, tesla, theverge, together.ai, uber, vercel, vodafone, voltagent, warp, webflow, wired, wise, x.ai, zapier
