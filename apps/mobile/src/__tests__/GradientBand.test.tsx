import { bandStops, BAND_INK } from "../components/GradientBand";
import { contrastRatio } from "../theme/color";
import { palettes, PALETTE_ORDER, isDarkPalette } from "../theme/palettes";

// Fable fix round: BAND_INK must clear WCAG AA body text (4.5:1) on every stop
// of the band gradient, on all 8 palettes. Before darkenUntil: midnight mid 4.23,
// darkCherry mid 3.67, blushLavender from 4.00, oceanMist from 3.68.
test.each(PALETTE_ORDER)("%s: BAND_INK >= 4.5:1 on every band stop", (k) => {
  const s = bandStops(palettes[k], isDarkPalette(k));
  for (const stop of [s.from, s.mid, s.to]) expect(contrastRatio(BAND_INK, stop)).toBeGreaterThanOrEqual(4.5);
});
