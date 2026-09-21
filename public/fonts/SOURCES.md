# Cover fonts

The cover uses local, renamed subsets of IBM Plex, under the SIL Open Font
License. Copyright and license records are retained in the fonts and the
adjacent license files.

- `resonance-sans-regular.woff2` / `resonance-sans-semibold.woff2`:
  IBM Plex Sans SC Regular / SemiBold, from `@ibm/plex-sans-sc` 1.1.0.
  Source: https://github.com/IBM/plex/tree/master/packages/plex-sans-sc
  Binary source: https://unpkg.com/@ibm/plex-sans-sc@1.1.0/fonts/complete/woff2/hinted/
- `resonance-mono-regular.woff2` / `resonance-mono-semibold.woff2`:
  IBM Plex Mono Regular / SemiBold.
  Source: https://github.com/google/fonts/tree/main/ofl/ibmplexmono

Prepared 2026-09-20 with fontTools (WOFF2). The internal derivative families are
named `Resonance Sans` and `Resonance Mono`. Letterforms are unchanged.

The Sans subsets cover the characters in `cover-glyphs.txt`, collected from the
cover component and the resonance demo data, plus printable ASCII. Mono covers
printable ASCII and the right-arrow character. If cover copy introduces new
characters, regenerate the subsets with the updated text; system fallback fonts
remain available. These fonts are scoped to the cover; experience pages retain
their existing typography.
