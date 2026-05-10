# Renkumi Design System

## Summary

Renkumi uses the Vercel-inspired rules from `data/design-library/vercel/DESIGN.md` as a product-console design language: white canvas, near-black ink, Geist-style typography, shadow-as-border surfaces, and a preview-first workflow. The core product flow is text script + user screenshots -> Remotion video. The brand name comes from Render + Kumu, the Japanese verb for assembling and composing, and should read as "组合镜头与动态." GPT Image is an optional enhancement layer for image optimization or expansion, not a dependency.

## Visual Principles

- Use a pure white page canvas with Vercel near-black ink (`#171717`) and muted secondary copy (`#666666`).
- Use Vercel black (`#171717`) as the primary CTA/action color, with blue (`#0070f3`) reserved for focus and technical status accents.
- Keep typography modest: page headlines around 28px, section headings around 22px, body text at 14-16px.
- Prefer visual preview and concrete output metadata over explanatory product text.
- Use compact Vercel geometry: 6-8px controls and cards, pill badges only for metadata/status.
- Prefer shadow-as-border (`0 0 0 1px rgba(0,0,0,.08)`) over traditional heavy borders or decorative shadows.

## Layout

- Top navigation is an 80px white bar with a left brand lockup, centered product tabs, and right actions, separated by a shadow-border.
- The first content band pairs a concise product statement with a pill-shaped action summary.
- The homepage must stay simple: one large text input, one multi-image upload, one primary generate action.
- The main workspace is preview-first: Remotion player plus render progress, with uploaded screenshots visible as supporting context.
- The preview column stays sticky on desktop so script changes remain visually connected to the video.
- Mobile collapses into one column, with the pill action bar becoming stacked segments.

## Components

- Primary button: Vercel black fill, white text, 48px minimum height, 6px radius, 14-16px label at weight 500.
- Secondary button: white fill, ink text, shadow-border ring, same height and radius as primary.
- Search/action pill: white surface, full radius, divided into project/output/scene segments, ending in a dark action orb.
- Scene cards: repeated editable items with 8px radius, shadow-border ring, no heavy elevation.
- Asset rows: compact repeated items with image thumbnail, asset id, type, and source path.
- Upload box: dashed 8px rounded surface for first-party product screenshots. It belongs before optional AI enhancement.
- Metric strip: three equal cells for duration, ratio, and fps; keep labels muted and values quiet.
- Progress card: live render progress with a dark progress bar, status message, frame counts, and download CTA after success.

## Content Rules

- Chinese labels should be short and operational: `品牌`, `脚本`, `截图`, `导出 MP4`.
- Avoid long in-app explanations. Use concise status text only when an action is running or completed.
- Keep Renkumi product copy focused on reusable video production: text, screenshots, render, outputs.
- Do not let generated image prompts replace real product screenshots for UI accuracy.
- Treat GPT Image as optional enhancement. No-key and failed-generation states must keep the video workflow usable with local placeholders or uploaded screenshots.
- Avoid exposing per-scene editing on the homepage unless an explicit advanced mode is added later.

## Implementation Notes

- The app uses `components/VideoConsole.tsx` for the editable console and `app/globals.css` for the design tokens.
- Keep `data/design-library/vercel/DESIGN.md` as the imported Vercel reference and this file as the project-specific adaptation.
- Remotion preview remains the primary visual asset; future 9:16 or sales-demo versions should reuse the same layout language.
- New UI should use the existing CSS tokens before adding new colors, radii, shadows, or type scales.
