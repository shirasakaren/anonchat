/** Theme variant - dark or light. */
export type ThemeVariant = "dark" | "light";

/** Metadata for one theme. */
export interface ThemeMeta {
  id: string;
  name: string;
  variant: ThemeVariant;
  description: string;
}

/** All available themes, ordered by variant then alphabetically. */
export const THEMES: ThemeMeta[] = [
  // ── Dark themes ──────────────────────────────────────────────────────
  {
    id: "monochrome-dark",
    name: "Monochrome Dark",
    variant: "dark",
    description: "Dark canvas with neutral white text - the default Anonchat look",
  },
  {
    id: "amber-dark",
    name: "Amber",
    variant: "dark",
    description: "Warm earth tones with gold accents",
  },
  {
    id: "amethyst-dark",
    name: "Amethyst",
    variant: "dark",
    description: "Deep plum with purple accents",
  },
  {
    id: "cherry",
    name: "Cherry",
    variant: "dark",
    description: "Dark with pink cherry blossom accents",
  },
  {
    id: "crimson-dark",
    name: "Crimson",
    variant: "dark",
    description: "Deep burgundy with rose accents",
  },
  {
    id: "emerald-dark",
    name: "Emerald",
    variant: "dark",
    description: "Rich gemstone green on dark",
  },
  {
    id: "forest-dark",
    name: "Forest",
    variant: "dark",
    description: "Deep evergreen with green accents",
  },
  {
    id: "graphite-dark",
    name: "Graphite",
    variant: "dark",
    description: "Neutral gray - balanced and understated",
  },
  {
    id: "midnight",
    name: "Midnight",
    variant: "dark",
    description: "Ultra-dark blue-black with stark contrast",
  },
  {
    id: "ocean-dark",
    name: "Ocean",
    variant: "dark",
    description: "Deep navy with blue accents",
  },
  {
    id: "slate-dark",
    name: "Slate",
    variant: "dark",
    description: "Cool blue-gray tones",
  },
  {
    id: "sunset",
    name: "Sunset",
    variant: "dark",
    description: "Warm orange-to-rose gradient accents",
  },
  {
    id: "teal-dark",
    name: "Teal",
    variant: "dark",
    description: "Deep teal waters",
  },

  // ── Light themes ─────────────────────────────────────────────────────
  {
    id: "paper",
    name: "Paper",
    variant: "light",
    description: "Warm white canvas - the terminal-on-paper style reference",
  },
  {
    id: "cloud-light",
    name: "Cloud",
    variant: "light",
    description: "Cool high-altitude blue-gray",
  },
  {
    id: "forest-light",
    name: "Forest Light",
    variant: "light",
    description: "Fresh green morning tones",
  },
  {
    id: "glacier",
    name: "Glacier",
    variant: "light",
    description: "Cold icy blue - crisp and clean",
  },
  {
    id: "honey-light",
    name: "Honey",
    variant: "light",
    description: "Warm golden morning glow",
  },
  {
    id: "lavender-light",
    name: "Lavender",
    variant: "light",
    description: "Calm purple field tones",
  },
  {
    id: "matcha",
    name: "Matcha",
    variant: "light",
    description: "Soft earthy green-cream tea tones",
  },
  {
    id: "mint-light",
    name: "Mint",
    variant: "light",
    description: "Refreshing cool green mint",
  },
  {
    id: "ocean-light",
    name: "Ocean Light",
    variant: "light",
    description: "Open sky blue",
  },
  {
    id: "rose-light",
    name: "Rose",
    variant: "light",
    description: "Soft floral pink tones",
  },
  {
    id: "sepia",
    name: "Sepia",
    variant: "light",
    description: "Warm vintage brown-cream - aged paper",
  },

  // ── Special / gradient themes ────────────────────────────────────────
  {
    id: "aurora",
    name: "Aurora",
    variant: "dark",
    description: "Dark with green/cyan northern-lights accents",
  },
];

/** The default theme applied when no theme is stored. */
export const DEFAULT_THEME = "monochrome-dark";

/** Find theme metadata by id. Returns undefined for unknown ids. */
export function getThemeMeta(id: string): ThemeMeta | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Group themes by variant. */
export function themesByVariant(): Record<ThemeVariant, ThemeMeta[]> {
  return THEMES.reduce(
    (acc, t) => {
      acc[t.variant].push(t);
      return acc;
    },
    { dark: [] as ThemeMeta[], light: [] as ThemeMeta[] },
  );
}
