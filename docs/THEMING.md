# Theming

The app ships **four** color variants plus a System option, built on
`next-themes` and Tailwind v4 design tokens. The palette is derived from the app
logo (ChatGPT red on a cream document).

## Variants

| Theme  | Class on `<html>`  | Description                                         |
| ------ | ------------------ | --------------------------------------------------- |
| Light  | `:root` (no class) | Warm off-white, the default base                    |
| Dark   | `.dark`            | Warm near-black                                     |
| AMOLED | `.amoled`          | Pure-black surfaces for OLED screens                |
| Brand  | `.brand`           | Red-forward light theme — the logo's signature look |
| System | —                  | Follows the OS preference (`enableSystem`)          |

The brand red (~`#E8332A`, lightness tuned to `0.575` so white text clears WCAG
AA ≈ 4.5:1) is intentionally identical across every theme so the primary button
reads the same everywhere.

## Configuration

- **Provider:** `app/layout.tsx` wraps the app in `ThemeProvider` (the
  `components/theme-provider.tsx` wrapper around next-themes — import the wrapper,
  never next-themes directly, in a Server Component) with:
  ```tsx
  attribute="class" defaultTheme="system" enableSystem
  themes={['light', 'dark', 'amoled', 'brand']} disableTransitionOnChange
  ```
- **Switcher:** `components/shared/ThemeSwitcher.tsx` — a dependency-free
  dropdown (no `@radix-ui/react-dropdown-menu`) using `menuitemradio` semantics,
  outside-click/Escape to close, and a mounted-guard to avoid hydration
  mismatch. Its option `value`s must match the `themes` array above.

## The Single-Class Gotcha

next-themes applies each theme as a **single** class via `classList.add/remove`,
which does **not** split on spaces — a multi-class value would throw. So:

- AMOLED is a self-contained `.amoled` class (not `dark amoled`).
- `app/globals.css` extends Tailwind's `dark` variant to also match `.amoled`:
  ```css
  @custom-variant dark (&:is(.dark *, .amoled *));
  ```
  so `dark:` utilities still apply under AMOLED while `.amoled` only overrides
  surfaces to pure black.

## Tokens

`app/globals.css` maps the full shadcn/ui token set through Tailwind v4's
`@theme inline` (background, foreground, card, popover, primary, secondary,
muted, accent, destructive, border, input, ring, charts, radius, shadows), with
each variant overriding the raw `--*` custom properties. Colors are authored in
`oklch`. `suppressHydrationWarning` is set on `<html>` because next-themes
updates the element on the client (and on `<body>` for browser-extension
attribute injection).
