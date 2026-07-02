#!/usr/bin/env python3
"""
Regenerate Dunceious brand assets into public/.

Outputs:
  public/favicon.svg          rounded slate tile + sky DNA double-helix (primary, scalable)
  public/favicon-32.png       32x32 PNG fallback (older browsers)
  public/apple-touch-icon.png 180x180 full-bleed PNG (iOS home screen)
  public/og-image.png         1200x630 social preview card

Requires: python3 + cairosvg (pip install cairosvg). Palette + motif derive from the app
(sky-500 helix on slate-950; feature-track accents = emerald/amber/rose/indigo).
Run:  python3 scripts/gen-brand-assets.py
"""
import math, os, subprocess, tempfile

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
os.makedirs(PUBLIC, exist_ok=True)

VOID, VOID2, SKY, SKY_HI, SKY_LO = "#020617", "#0b1220", "#0ea5e9", "#38bdf8", "#0284c7"
INK, MUTE, FAINT, RULE = "#f8fafc", "#94a3b8", "#1e293b", "#334155"
EMER, AMBER, ROSE, INDIGO = "#10b981", "#f59e0b", "#f43f5e", "#6366f1"


def helix(cx, y0, y1, amp, period, phase, step=1.0):
    pts, y = [], y0
    while y <= y1 + 1e-3:
        pts.append((cx + amp * math.sin((y - y0) / period * 2 * math.pi + phase), y))
        y += step
    return "M %.2f %.2f " % pts[0] + " ".join("L %.2f %.2f" % p for p in pts[1:])


def rungs(cx, y0, amp, period, count, ybound):
    out, k = [], 0
    while len(out) < count:
        y = y0 + period * (0.25 + 0.5 * k)
        if y > ybound:
            break
        a = (y - y0) / period * 2 * math.pi
        out.append((cx + amp * math.sin(a), cx + amp * math.sin(a + math.pi), y))
        k += 1
    return out


def favicon(full_bleed=False):
    cx, y0, y1, amp, period = 32, 10, 54, 12.5, 22.0
    sa = helix(cx, y0, y1, amp, period, 0.0)
    sb = helix(cx, y0, y1, amp, period, math.pi)
    cols = [EMER, AMBER, ROSE, SKY_HI]
    rsvg = "".join(
        f'<line x1="{a:.2f}" y1="{y:.2f}" x2="{b:.2f}" y2="{y:.2f}" stroke="{cols[i%4]}" '
        f'stroke-width="4.4" stroke-linecap="round" opacity="0.95"/>'
        for i, (a, b, y) in enumerate(rungs(cx, y0, amp, period, 4, y1)))
    tile = ('<rect width="64" height="64" fill="url(#bg)"/>' if full_bleed else
            f'<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#bg)" '
            f'stroke="{SKY}" stroke-opacity="0.28" stroke-width="1.5"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{VOID2}"/><stop offset="1" stop-color="{VOID}"/></linearGradient>
    <linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{SKY_HI}"/><stop offset="1" stop-color="{SKY}"/></linearGradient>
  </defs>
  {tile}
  {rsvg}
  <path d="{sb}" fill="none" stroke="{SKY_LO}" stroke-width="5.2" stroke-linecap="round"/>
  <path d="{sa}" fill="none" stroke="url(#sa)" stroke-width="5.6" stroke-linecap="round"/>
</svg>'''


def helix_mark(w=46, h=46):
    cx, y0, y1, amp, period = w / 2, 6, h - 6, 8.5, (h - 12) / 1.9
    sa = helix(cx, y0, y1, amp, period, 0.0)
    sb = helix(cx, y0, y1, amp, period, math.pi)
    cols = [EMER, AMBER, ROSE, SKY_HI]
    rsvg = "".join(
        f'<line x1="{a:.2f}" y1="{y:.2f}" x2="{b:.2f}" y2="{y:.2f}" stroke="{cols[i%4]}" stroke-width="3.2" stroke-linecap="round"/>'
        for i, (a, b, y) in enumerate(rungs(cx, y0, amp, period, 4, y1)))
    return (f'<path d="{sb}" fill="none" stroke="{SKY_LO}" stroke-width="4.0" stroke-linecap="round"/>{rsvg}'
            f'<path d="{sa}" fill="none" stroke="{SKY_HI}" stroke-width="4.3" stroke-linecap="round"/>')


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
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <radialGradient id="glow" cx="26%" cy="46%" r="60%"><stop offset="0" stop-color="{SKY}" stop-opacity="0.16"/><stop offset="1" stop-color="{SKY}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{VOID}" stop-opacity="0"/><stop offset="0.85" stop-color="{VOID}" stop-opacity="1"/></linearGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="{VOID}"/>
  <g>{grid}</g>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  <g transform="translate({ML},50)">{helix_mark()}</g>
  <text x="{ML+58}" y="82" fill="{INK}" font-family="JetBrains Mono" font-weight="800" font-size="27">DUNCEIOUS</text>
  <rect x="{W-80-232}" y="52" width="232" height="38" rx="19" fill="none" stroke="{SKY}" stroke-opacity="0.5"/>
  <text x="{W-80-116}" y="77" fill="{SKY_HI}" font-family="JetBrains Mono" font-size="15" letter-spacing="1.5" text-anchor="middle">NOTHING&#160;UPLOADED</text>
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
