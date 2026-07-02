#!/usr/bin/env python3
#
# Dunceious
#
# This file is part of Dunceious.
#
# Dunceious is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Dunceious is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
#

"""
Regenerate Dunceious brand assets into public/.

Outputs:
  public/favicon.svg          rounded slate tile + sky fa-dna helix (primary, scalable)
  public/favicon-32.png       32x32 PNG fallback (older browsers)
  public/apple-touch-icon.png 180x180 full-bleed PNG (iOS home screen)
  public/og-image.png         1200x630 social preview card

The DNA mark is the Font Awesome Free 6.4.0 "dna" (fa-dna) glyph
(Icons: CC BY 4.0 - https://fontawesome.com/license/free), the same icon used
throughout the app UI, rendered in the app's sky gradient on slate.

Requires: python3 + cairosvg (pip install cairosvg).
Run:  python3 scripts/gen-brand-assets.py
"""
import os, subprocess, tempfile

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
os.makedirs(PUBLIC, exist_ok=True)

VOID, SKY, SKY_HI, SKY_LO = "#020617", "#0ea5e9", "#38bdf8", "#0284c7"
INK, MUTE, FAINT, RULE = "#f8fafc", "#94a3b8", "#1e293b", "#334155"
EMER, AMBER, ROSE, INDIGO = "#10b981", "#f59e0b", "#f43f5e", "#6366f1"

# Approved favicon gradient: bright sky at top easing to sky-500 at the base
# (keeps the lower helix legible against the near-black tile).
GRAD_TOP, GRAD_BOT = "#38bdf8", "#0ea5e9"
FA_ATTR = "Font Awesome Free 6.4.0 fa-dna glyph, CC BY 4.0 - https://fontawesome.com/license/free"

# AGPL header emitted into generated SVGs (see scripts/check-license-headers.mjs).
AGPL_SVG = (
    "<!--\n"
    "  Dunceious\n\n"
    "  This file is part of Dunceious.\n\n"
    "  Dunceious is free software: you can redistribute it and/or modify\n"
    "  it under the terms of the GNU Affero General Public License as published by\n"
    "  the Free Software Foundation, either version 3 of the License, or\n"
    "  (at your option) any later version.\n\n"
    "  Dunceious is distributed in the hope that it will be useful,\n"
    "  but WITHOUT ANY WARRANTY; without even the implied warranty of\n"
    "  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the\n"
    "  GNU Affero General Public License for more details.\n\n"
    "  You should have received a copy of the GNU Affero General Public License\n"
    "  along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.\n"
    "-->\n"
)

# fa-dna solid glyph, viewBox 0 0 448 512
DNA = ("M416 0c17.7 0 32 14.3 32 32c0 59.8-30.3 107.5-69.4 146.6c-28 28-62.5 53.5-97.3 77.4l-2.5 1.7c-11.9 8.1-23.8 "
       "16.1-35.5 23.9l0 0 0 0 0 0-1.6 1c-6 4-11.9 7.9-17.8 11.9c-20.9 14-40.8 27.7-59.3 41.5H283.3c-9.8-7.4-20.1-14.7"
       "-30.7-22.1l7-4.7 3-2c15.1-10.1 30.9-20.6 46.7-31.6c25 18.1 48.9 37.3 69.4 57.7C417.7 372.5 448 420.2 448 480c0 "
       "17.7-14.3 32-32 32s-32-14.3-32-32H64c0 17.7-14.3 32-32 32s-32-14.3-32-32c0-59.8 30.3-107.5 69.4-146.6c28-28 62.5"
       "-53.5 97.3-77.4c-34.8-23.9-69.3-49.3-97.3-77.4C30.3 139.5 0 91.8 0 32C0 14.3 14.3 0 32 0S64 14.3 64 32H384c0-17.7 "
       "14.3-32 32-32zM338.6 384H109.4c-10.1 10.6-18.6 21.3-25.5 32H364.1c-6.8-10.7-15.3-21.4-25.5-32zM109.4 128H338.6c10.1"
       "-10.7 18.6-21.3 25.5-32H83.9c6.8 10.7 15.3 21.3 25.5 32zm55.4 48c18.4 13.8 38.4 27.5 59.3 41.5c20.9-14 40.8-27.7 "
       "59.3-41.5H164.7z")


def dna_group(fill, cx, cy, height):
    """fa-dna glyph centered on (cx, cy) at the given rendered height (px)."""
    s = height / 512.0
    w, h = 448 * s, 512 * s
    return (f'<g transform="translate({cx-w/2:.2f},{cy-h/2:.2f}) scale({s:.5f})">'
            f'<path d="{DNA}" fill="{fill}"/></g>')


def favicon(full_bleed=False):
    tile = ('<rect width="64" height="64" fill="url(#bg)"/>' if full_bleed else
            f'<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#bg)" '
            f'stroke="{SKY}" stroke-opacity="0.22" stroke-width="1.5"/>')
    return AGPL_SVG + f'''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><!-- {FA_ATTR} -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="{VOID}"/></linearGradient>
    <linearGradient id="dna" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GRAD_TOP}"/><stop offset="1" stop-color="{GRAD_BOT}"/></linearGradient>
  </defs>
  {tile}
  {dna_group("url(#dna)", 32, 32, 40)}
</svg>'''


def og():
    W, H, ML = 1200, 630, 80
    grid = "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="{FAINT}" stroke-width="1" opacity="0.35"/>'
                   for x in range(0, W + 1, 60))
    x0, x1, ry = ML, W - ML, 476
    n = 15
    ticks = "".join(
        f'<line x1="{x0+(x1-x0)*i/n:.1f}" y1="{ry}" x2="{x0+(x1-x0)*i/n:.1f}" y2="{ry+(10 if i%5==0 else 5)}" '
        f'stroke="{RULE}" stroke-width="{2 if i%5==0 else 1}"/>' for i in range(n + 1))
    labels = ""
    for frac, lab in [(0.0, "1"), (0.5, "5,400"), (1.0, "10,842 bp")]:
        anc = "start" if frac == 0 else ("end" if frac == 1 else "middle")
        labels += (f'<text x="{x0+(x1-x0)*frac:.1f}" y="{ry-12}" fill="{MUTE}" '
                   f'font-family="JetBrains Mono" font-size="17" text-anchor="{anc}">{lab}</text>')
    feats = [(0.02, 0.16, EMER, 0, "gene"), (0.20, 0.10, SKY, 0, "CDS"), (0.33, 0.22, AMBER, 0, "ORF"),
             (0.58, 0.13, INDIGO, 0, "rRNA"), (0.74, 0.24, ROSE, 0, "CDS"),
             (0.09, 0.14, SKY_LO, 1, ""), (0.28, 0.30, EMER, 1, ""), (0.66, 0.19, AMBER, 1, "")]
    ly, lh = [500, 526], [22, 12]
    blocks = ""
    for sf, wf, col, lane, lab in feats:
        bx, bw, by, bh = x0 + (x1 - x0) * sf, (x1 - x0) * wf, ly[lane], lh[lane]
        blocks += f'<rect x="{bx:.1f}" y="{by}" width="{bw:.1f}" height="{bh}" rx="{min(6,bh/2)}" fill="{col}" opacity="{0.92 if lane==0 else 0.5}"/>'
        if lab:
            blocks += f'<text x="{bx+9:.1f}" y="{by+bh-6}" fill="#04121f" font-family="JetBrains Mono" font-size="12.5" font-weight="700">{lab}</text>'
    seq = "ATGCGTACAGGCATTACGGATCCGTAAGCTTGCAAGTCCGATTGCACGTAAGGCTTACCGGATCAATGCCAGTTACGGATCAGGCATACGT"
    bc = {"A": EMER, "T": ROSE, "G": AMBER, "C": SKY_HI}
    nuc = f'<text x="{ML}" y="574" font-family="JetBrains Mono" font-size="26" letter-spacing="1.6">' + \
          "".join(f'<tspan fill="{bc[b]}">{b}</tspan>' for b in seq) + "</text>"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><!-- {FA_ATTR} -->
  <defs>
    <radialGradient id="glow" cx="26%" cy="46%" r="60%"><stop offset="0" stop-color="{SKY}" stop-opacity="0.16"/><stop offset="1" stop-color="{SKY}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{VOID}" stop-opacity="0"/><stop offset="0.85" stop-color="{VOID}" stop-opacity="1"/></linearGradient>
    <linearGradient id="dnamark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GRAD_TOP}"/><stop offset="1" stop-color="{GRAD_BOT}"/></linearGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="{VOID}"/>
  <g>{grid}</g>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  {dna_group("url(#dnamark)", ML+18, 71, 46)}
  <text x="{ML+52}" y="82" fill="{INK}" font-family="JetBrains Mono" font-weight="800" font-size="27">DUNCEIOUS</text>
  <rect x="{W-80-232}" y="52" width="232" height="38" rx="19" fill="none" stroke="{SKY}" stroke-opacity="0.5"/>
  <text x="{W-80-116}" y="77" fill="{SKY_HI}" font-family="JetBrains Mono" font-size="15" letter-spacing="1.5" text-anchor="middle">NOTHING&#160;IS&#160;STORED</text>
  <text x="{ML}" y="212" fill="{SKY_HI}" font-family="JetBrains Mono" font-weight="500" font-size="21" letter-spacing="7">BROWSER-NATIVE&#160;GENOMICS</text>
  <text x="{ML-4}" y="316" fill="{INK}" font-family="JetBrains Mono" font-weight="800" font-size="108">DUNCEIOUS</text>
  <text x="{ML}" y="372" fill="#cbd5e1" font-family="JetBrains Mono" font-weight="500" font-size="34">Intelligence is Overpriced<tspan fill="{SKY}">.</tspan></text>
  <text x="{ML}" y="420" fill="{MUTE}" font-family="JetBrains Mono" font-weight="400" font-size="22">Parse, view &amp; search GenBank / FASTA locally &#8212; nothing leaves your browser.</text>
  <line x1="{x0}" y1="{ry}" x2="{x1}" y2="{ry}" stroke="{RULE}" stroke-width="2"/>
  {ticks}{labels}{blocks}{nuc}
  <rect x="860" y="548" width="340" height="42" fill="url(#fade)"/>
</svg>'''


def rasterize(svg_text, out_png, w, h):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as tf:
        tf.write(svg_text)
        tmp = tf.name
    subprocess.run(["cairosvg", tmp, "-o", out_png, "--output-width", str(w), "--output-height", str(h)], check=True)
    os.unlink(tmp)


def main():
    with open(os.path.join(PUBLIC, "favicon.svg"), "w") as f:
        f.write(favicon(full_bleed=False))
    rasterize(favicon(full_bleed=False), os.path.join(PUBLIC, "favicon-32.png"), 32, 32)
    rasterize(favicon(full_bleed=True), os.path.join(PUBLIC, "apple-touch-icon.png"), 180, 180)
    rasterize(og(), os.path.join(PUBLIC, "og-image.png"), 1200, 630)
    print("Wrote public/{favicon.svg, favicon-32.png, apple-touch-icon.png, og-image.png}")


if __name__ == "__main__":
    main()
