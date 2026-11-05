#!/usr/bin/env python3
#
# Dunceious
# Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
Regenerate Dunceious brand assets into public/ and docs/assets/.

Outputs:
  public/favicon.svg             rounded slate tile + sky fa-dna helix (primary, scalable)
  public/favicon-32.png          32x32 PNG fallback (older browsers)
  public/apple-touch-icon.png    180x180 full-bleed PNG (iOS home screen)
  public/og-image.png            1200x630 social preview card
  docs/assets/readme-banner.svg  1280x400 README banner (outlined text, no fonts needed)

The DNA mark is the Font Awesome Free 6.4.0 "dna" (fa-dna) glyph
(Icons: CC BY 4.0 - https://fontawesome.com/license/free), the same icon used
throughout the app UI, rendered in the app's sky gradient on slate.

Requires: python3 + cairosvg (pip install cairosvg).
Run:  python3 scripts/gen-brand-assets.py
"""
import math, os, subprocess, tempfile

ROOT        = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC      = os.path.join(ROOT, "public")
DOCS_ASSETS = os.path.join(ROOT, "docs", "assets")
os.makedirs(PUBLIC, exist_ok=True)
os.makedirs(DOCS_ASSETS, exist_ok=True)

VOID, SKY, SKY_HI, SKY_LO = "#020617", "#0ea5e9", "#38bdf8", "#0284c7"
INK, MUTE, FAINT, RULE = "#f8fafc", "#94a3b8", "#1e293b", "#334155"
EMER, AMBER, ROSE, INDIGO = "#10b981", "#f59e0b", "#f43f5e", "#6366f1"
SLATE, CYAN, TEAL = "#0f172a", "#22d3ee", "#0d9488"

DEMO_SEQ = "ATGCGTACAGGCATTACGGATCCGTAAGCTTGCAAGTCCGATTGCACGTAAGGCTTACCGGATCAATGCCAGTTACGGATCAGGCATACGT"
BASE_COLORS = {"A": EMER, "T": ROSE, "G": AMBER, "C": SKY_HI}
MONO_STACK = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

# Approved favicon gradient: bright sky at top easing to sky-500 at the base
# (keeps the lower helix legible against the near-black tile).
GRAD_TOP, GRAD_BOT = "#38bdf8", "#0ea5e9"
FA_ATTR = "Font Awesome Free 6.4.0 fa-dna glyph, CC BY 4.0 - https://fontawesome.com/license/free"

# AGPL header emitted into generated SVGs (see scripts/check-license-headers.mjs).
AGPL_SVG = (
    "<!--\n"
    "  Dunceious\n"
    "  Copyright (C) 2026 João Victor Daijo and Murilo Cassiano\n\n"
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

# Inter 4.001 Italic (The Inter Project Authors, OFL-1.1 - https://openfontlicense.org) at wght 900:
# the face of the app's font-black italic wordmark. Baked as outlines because an SVG shown through a
# README <img> cannot load web fonts, and system fallbacks would change the wordmark per viewer.
# (advance, path) in 2048 units/em, y-down from the baseline; uppercase only, as the brand sets it.
INTER_UPM, INTER_SPACE = 2048, 408
INTER_BLACK_ITALIC = {
    "A": (1628, "M-47 0 683 -1490H1235L1489 0H1047L970 -578Q945 -766 930 -968Q914 -1171 903 -1371H995Q920 -1171 844 -968Q767 -766 682 -578L421 0ZM358 -286 408 -588H1228L1178 -286Z"),
    "B": (1368, "M3 0 250 -1490H886Q1056 -1490 1166 -1440Q1276 -1391 1323 -1302Q1370 -1212 1350 -1092Q1338 -1016 1289 -954Q1240 -891 1166 -848Q1093 -806 1005 -789V-776Q1100 -773 1172 -724Q1244 -676 1278 -592Q1312 -508 1293 -396Q1274 -280 1198 -190Q1123 -101 1000 -50Q878 0 716 0ZM461 -322H640Q741 -322 806 -369Q871 -416 884 -500Q892 -546 876 -576Q859 -607 820 -622Q780 -638 719 -638H513ZM554 -888H710Q763 -888 810 -908Q856 -928 888 -966Q920 -1004 928 -1056Q938 -1115 898 -1144Q859 -1172 784 -1172H601Z"),
    "C": (1532, "M714 20Q530 20 390 -51Q249 -122 170 -259Q91 -396 91 -594Q91 -781 150 -946Q208 -1112 318 -1239Q428 -1366 582 -1438Q736 -1510 926 -1510Q1066 -1510 1180 -1473Q1295 -1436 1376 -1364Q1457 -1293 1497 -1188Q1537 -1083 1529 -946H1119Q1121 -994 1110 -1033Q1099 -1072 1074 -1100Q1049 -1128 1011 -1143Q973 -1158 921 -1158Q814 -1158 735 -1107Q656 -1056 604 -972Q553 -889 528 -790Q502 -691 502 -595Q502 -507 530 -448Q557 -390 610 -361Q664 -332 741 -332Q800 -332 850 -347Q901 -362 942 -390Q982 -418 1011 -457Q1040 -496 1055 -544H1465Q1442 -449 1382 -350Q1321 -251 1226 -167Q1131 -83 1002 -32Q874 20 714 20Z"),
    "D": (1479, "M625 0H169L226 -344H618Q729 -344 813 -379Q897 -414 953 -502Q1009 -589 1034 -744Q1060 -900 1035 -988Q1010 -1075 937 -1110Q864 -1146 747 -1146H353L410 -1490H802Q1032 -1490 1188 -1400Q1344 -1311 1412 -1144Q1479 -977 1440 -744Q1402 -512 1296 -345Q1189 -178 1020 -89Q852 0 625 0ZM654 -1490 407 0H3L250 -1490Z"),
    "E": (1274, "M3 0 250 -1490H1324L1270 -1164H600L558 -912H1172L1119 -594H505L461 -326H1127L1073 0Z"),
    "F": (1196, "M3 0 250 -1490H1298L1244 -1164H600L544 -828H1124L1071 -510H491L407 0Z"),
    "G": (1546, "M726 20Q531 20 388 -54Q246 -129 168 -267Q91 -405 91 -597Q91 -784 152 -950Q213 -1115 326 -1241Q438 -1367 593 -1438Q748 -1510 936 -1510Q1062 -1510 1172 -1475Q1283 -1440 1365 -1373Q1447 -1306 1490 -1212Q1534 -1117 1526 -998H1118Q1115 -1036 1101 -1066Q1087 -1096 1063 -1116Q1039 -1137 1005 -1148Q971 -1158 927 -1158Q821 -1158 742 -1109Q662 -1060 609 -978Q556 -897 530 -798Q503 -700 503 -600Q503 -471 563 -402Q623 -332 747 -332Q844 -332 915 -362Q986 -392 1028 -445Q1071 -498 1082 -565L1148 -544H809L856 -832H1516L1480 -613Q1455 -460 1388 -342Q1320 -224 1220 -144Q1120 -63 994 -22Q868 20 726 20Z"),
    "H": (1536, "M3 0 250 -1490H654L560 -924H1096L1190 -1490H1594L1347 0H943L1042 -598H506L407 0Z"),
    "I": (596, "M654 -1490 407 0H3L250 -1490Z"),
    "J": (1221, "M507 20Q274 20 145 -79Q16 -178 16 -364Q16 -380 18 -400Q19 -421 24 -458Q30 -495 41 -559H445Q435 -500 430 -471Q426 -442 425 -430Q424 -418 424 -411Q424 -352 454 -323Q485 -294 543 -294Q610 -294 653 -335Q696 -376 710 -460L881 -1490H1279L1109 -468Q1070 -233 918 -106Q766 20 507 20Z"),
    "K": (1555, "M353 -261 386 -603Q443 -697 494 -772Q546 -848 611 -926Q676 -1004 772 -1107L1132 -1490H1635L885 -723L849 -739ZM3 0 250 -1490H666L613 -1170L534 -741L509 -544L419 0ZM964 0 704 -599 985 -895 1416 0Z"),
    "L": (1158, "M3 0 250 -1490H654L461 -326H1063L1009 0Z"),
    "M": (1958, "M3 0 250 -1490H888L945 -1024Q952 -964 957 -865Q962 -766 966 -652Q969 -539 970 -434Q970 -330 968 -258H893Q914 -330 950 -434Q985 -539 1025 -652Q1065 -766 1103 -865Q1141 -964 1168 -1024L1377 -1490H2016L1769 0H1361L1456 -576Q1465 -627 1482 -712Q1498 -796 1518 -897Q1537 -998 1556 -1100Q1576 -1202 1590 -1288H1613Q1579 -1193 1539 -1090Q1499 -988 1459 -890Q1419 -793 1384 -712Q1348 -630 1323 -576L1055 0H719L638 -576Q628 -648 616 -767Q604 -886 594 -1024Q584 -1162 579 -1288H608Q594 -1202 580 -1100Q565 -998 552 -897Q538 -796 526 -712Q515 -627 506 -576L411 0Z"),
    "N": (1576, "M3 0 250 -1490H690L948 -905Q982 -829 1009 -753Q1036 -677 1058 -586Q1081 -494 1100 -372H1065Q1073 -453 1083 -560Q1093 -666 1104 -770Q1116 -873 1127 -944L1218 -1490H1634L1387 0H947L706 -544Q665 -637 636 -718Q608 -798 582 -888Q557 -978 526 -1096H568Q559 -991 549 -887Q539 -783 529 -694Q519 -605 509 -544L419 0Z"),
    "O": (1590, "M720 20Q536 20 394 -52Q252 -123 172 -260Q91 -398 91 -597Q91 -784 150 -950Q209 -1115 320 -1241Q430 -1367 585 -1438Q740 -1510 932 -1510Q1115 -1510 1256 -1439Q1398 -1368 1479 -1230Q1560 -1092 1560 -892Q1560 -705 1500 -540Q1441 -375 1330 -249Q1220 -123 1066 -52Q911 20 720 20ZM737 -332Q846 -332 924 -384Q1002 -435 1052 -520Q1102 -604 1126 -703Q1149 -802 1149 -896Q1149 -983 1123 -1041Q1097 -1099 1045 -1128Q993 -1158 915 -1158Q806 -1158 728 -1106Q649 -1054 599 -970Q549 -885 526 -786Q502 -688 502 -594Q502 -508 528 -450Q555 -391 607 -362Q659 -332 737 -332Z"),
    "P": (1343, "M3 0 250 -1490H892Q1058 -1490 1172 -1424Q1285 -1359 1335 -1240Q1385 -1121 1358 -962Q1332 -802 1242 -686Q1151 -569 1012 -506Q874 -442 704 -442H320L372 -756H674Q746 -756 801 -782Q856 -807 891 -853Q926 -899 936 -962Q947 -1027 928 -1072Q908 -1118 861 -1142Q814 -1166 742 -1166H600L407 0Z"),
    "Q": (1590, "M646 -552H932L1023 -410L1179 -192L1379 110H1049L905 -96L815 -268ZM720 20Q536 20 394 -52Q252 -123 172 -260Q91 -398 91 -597Q91 -784 150 -950Q209 -1115 320 -1241Q430 -1367 585 -1438Q740 -1510 932 -1510Q1115 -1510 1256 -1439Q1398 -1368 1479 -1230Q1560 -1092 1560 -892Q1560 -705 1500 -540Q1441 -375 1330 -249Q1220 -123 1066 -52Q911 20 720 20ZM737 -332Q846 -332 924 -384Q1002 -435 1052 -520Q1102 -604 1126 -703Q1149 -802 1149 -896Q1149 -983 1123 -1041Q1097 -1099 1045 -1128Q993 -1158 915 -1158Q806 -1158 728 -1106Q649 -1054 599 -970Q549 -885 526 -786Q502 -688 502 -594Q502 -508 528 -450Q555 -391 607 -362Q659 -332 737 -332Z"),
    "R": (1368, "M3 0 250 -1490H892Q1058 -1490 1172 -1430Q1287 -1369 1338 -1256Q1388 -1142 1362 -984Q1336 -824 1246 -714Q1157 -604 1020 -548Q882 -492 712 -492H328L380 -806H682Q754 -806 808 -824Q862 -842 896 -881Q930 -920 940 -984Q956 -1079 902 -1122Q849 -1166 742 -1166H600L407 0ZM809 0 558 -684H988L1249 0Z"),
    "S": (1364, "M630 18Q436 18 295 -40Q154 -97 88 -217Q22 -337 52 -524H436Q428 -456 451 -409Q474 -362 526 -338Q577 -314 655 -314Q720 -314 766 -330Q813 -346 840 -374Q868 -403 874 -440Q880 -474 862 -500Q845 -525 800 -546Q754 -567 674 -584L529 -616Q339 -658 242 -760Q146 -861 175 -1036Q198 -1178 286 -1284Q375 -1391 514 -1450Q654 -1510 831 -1510Q1012 -1510 1140 -1450Q1267 -1389 1326 -1280Q1386 -1170 1363 -1024H975Q982 -1097 940 -1138Q898 -1178 800 -1178Q738 -1178 696 -1164Q653 -1149 630 -1123Q607 -1097 601 -1064Q595 -1029 612 -1002Q628 -976 669 -956Q710 -937 778 -922L895 -896Q1014 -869 1096 -826Q1177 -784 1224 -726Q1270 -668 1285 -596Q1300 -525 1286 -440Q1262 -293 1178 -190Q1095 -88 957 -35Q819 18 630 18Z"),
    "T": (1406, "M156 -1164 210 -1490H1504L1450 -1164H1005L812 0H408L601 -1164Z"),
    "U": (1478, "M663 18Q466 18 328 -52Q190 -123 128 -251Q66 -379 94 -549L250 -1490H654L500 -557Q489 -488 508 -438Q527 -387 572 -360Q616 -332 680 -332Q755 -332 820 -366Q884 -400 928 -457Q971 -514 982 -583L1132 -1490H1536L1376 -523Q1348 -353 1250 -232Q1152 -110 1001 -46Q850 18 663 18Z"),
    "V": (1628, "M453 0 200 -1490H658L735 -912Q761 -724 776 -530Q790 -335 800 -135H710Q786 -335 862 -530Q938 -724 1023 -912L1284 -1490H1736L1005 0Z"),
    "W": (2216, "M348 0 200 -1490H652L675 -912Q680 -803 676 -674Q673 -544 669 -415Q665 -286 665 -176H585Q624 -286 664 -415Q705 -544 747 -674Q789 -803 832 -912L1060 -1490H1464L1500 -912Q1507 -803 1506 -674Q1505 -544 1502 -415Q1500 -286 1503 -176H1422Q1459 -286 1497 -415Q1535 -544 1575 -674Q1615 -803 1656 -912L1872 -1490H2324L1682 0H1225L1177 -607Q1165 -764 1173 -946Q1181 -1128 1177 -1296H1283Q1216 -1128 1168 -947Q1120 -766 1054 -607L805 0Z"),
    "X": (1610, "M-47 0 746 -911 695 -602 260 -1490H715L802 -1296Q834 -1225 852 -1160Q870 -1096 884 -1038Q897 -981 917 -931H795Q833 -981 866 -1038Q900 -1096 940 -1160Q980 -1225 1036 -1296L1189 -1490H1660L953 -626L1000 -915L1471 0H996L876 -256Q847 -320 832 -364Q816 -407 806 -442Q795 -477 777 -515H831Q802 -477 780 -442Q757 -406 727 -362Q697 -319 644 -256L431 0Z"),
    "Y": (1588, "M508 0 594 -518 200 -1490H659L799 -1040Q819 -979 831 -914Q843 -850 853 -768H794Q829 -850 862 -914Q894 -979 931 -1040L1207 -1490H1696L996 -518L910 0Z"),
    "Z": (1423, "M10 0 47 -224 907 -1164H205L259 -1490H1475L1438 -1266L578 -326H1280L1226 0Z"),
    ".": (764, "M306 24Q211 24 156 -42Q101 -108 117 -205Q130 -282 191 -332Q252 -382 332 -382Q427 -382 482 -316Q537 -250 521 -153Q508 -76 447 -26Q386 24 306 24Z"),
}


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
    nuc = f'<text x="{ML}" y="574" font-family="JetBrains Mono" font-size="26" letter-spacing="1.6">' + \
          "".join(f'<tspan fill="{BASE_COLORS[b]}">{b}</tspan>' for b in DEMO_SEQ) + "</text>"
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
  <text x="{ML}" y="372" fill="#cbd5e1" font-family="JetBrains Mono" font-weight="500" font-size="34">Geniality is Overpriced<tspan fill="{SKY}">.</tspan></text>
  <text x="{ML}" y="420" fill="{MUTE}" font-family="JetBrains Mono" font-weight="400" font-size="22">Parse, view &amp; search GenBank / FASTA locally &#8212; nothing leaves your browser.</text>
  <line x1="{x0}" y1="{ry}" x2="{x1}" y2="{ry}" stroke="{RULE}" stroke-width="2"/>
  {ticks}{labels}{blocks}{nuc}
  <rect x="860" y="548" width="340" height="42" fill="url(#fade)"/>
</svg>'''


def outline_text(text, x, baseline, size, fill, tracking=0.0):
    """Set `text` uppercased in INTER_BLACK_ITALIC outlines; tracking is in em, like CSS
    letter-spacing (also applied after the last glyph). Returns (svg, x where the next glyph goes)."""
    s, step = size / INTER_UPM, tracking * INTER_UPM
    pen, glyphs = 0.0, []
    for ch in text.upper():
        if ch == " ":
            pen += INTER_SPACE + step
            continue
        adv, d = INTER_BLACK_ITALIC[ch]
        glyphs.append(f'<path transform="translate({pen:.0f})" d="{d}"/>')
        pen += adv + step
    return (f'<g transform="translate({x:.1f},{baseline:.1f}) scale({s:.5f})" fill="{fill}">'
            + "".join(glyphs) + "</g>"), x + pen * s


def helix(x0, x1, cy, amp, wavelength, fade):
    """Side-on double helix over [x0, x1]: back strand halves, base-pair rungs, then front halves,
    so the strands cross over each other. Everything ramps in from transparent over `fade` px."""
    k, f = 2 * math.pi / wavelength, fade / (x1 - x0)
    grad = (f'<linearGradient id="strand" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0">'
            f'<stop offset="0" stop-color="{SKY}" stop-opacity="0"/><stop offset="{f:.3f}" stop-color="{SKY}"/>'
            f'<stop offset="{(1+f)/2:.3f}" stop-color="{CYAN}"/><stop offset="1" stop-color="{TEAL}"/></linearGradient>')

    def y(x, strand):
        return cy + amp * math.sin(k * (x - x0) + strand * math.pi)

    # The strands swap depth wherever cos(phase) crosses zero: a quarter wave in, then every half wave.
    cuts, c = [x0], x0 + wavelength / 4
    while c < x1:
        cuts.append(c)
        c += wavelength / 2
    cuts.append(x1)
    back, front = [], []
    for strand in (0, 1):
        for a, b in zip(cuts, cuts[1:]):
            n = max(2, math.ceil((b - a) / 5))
            pts = " ".join(f"{a+(b-a)*i/n:.1f},{y(a+(b-a)*i/n, strand):.1f}" for i in range(n + 1))
            in_front = math.cos(k * ((a + b) / 2 - x0) + strand * math.pi) > 0
            (front if in_front else back).append(f'<polyline points="{pts}"/>')
    pair = {"A": "T", "T": "A", "G": "C", "C": "G"}
    rungs, step = [], wavelength / 10
    for i in range(int((x1 - x0) / step)):
        x = x0 + (i + 0.5) * step
        top, bot = y(x, 0), y(x, 1)
        if abs(top - bot) < 12:
            continue
        base, op = DEMO_SEQ[i % len(DEMO_SEQ)], min(1.0, (x - x0) / fade) * 0.85
        rungs.append(f'<g opacity="{op:.2f}">'
                     f'<line x1="{x:.1f}" y1="{top:.1f}" x2="{x:.1f}" y2="{cy:.1f}" stroke="{BASE_COLORS[base]}"/>'
                     f'<line x1="{x:.1f}" y1="{cy:.1f}" x2="{x:.1f}" y2="{bot:.1f}" stroke="{BASE_COLORS[pair[base]]}"/></g>')
    strand = 'fill="none" stroke="url(#strand)" stroke-linecap="round" stroke-linejoin="round"'
    return (f'{grad}<g {strand} stroke-width="6" opacity="0.4">{"".join(back)}</g>'
            f'<g stroke-width="4" stroke-linecap="round">{"".join(rungs)}</g>'
            f'<g {strand} stroke-width="9">{"".join(front)}</g>')


def readme_banner():
    W, H, ML = 1280, 400, 80
    grid = "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}"/>' for x in range(64, W, 64))
    wordmark, _ = outline_text("Dunceious", ML - 4, 232, 124, INK, tracking=-0.05)
    slogan, end = outline_text("Because geniality is overpriced", ML, 280, 20, MUTE, tracking=0.3)
    dot, _ = outline_text(".", end, 280, 20, SKY)
    chips, cx = "", ML
    for label in ("GenBank", "FASTA", "GFF3", "BED", "MSA"):
        w = len(label) * 9 + 32
        chips += (f'<rect x="{cx:.1f}" y="312" width="{w:.1f}" height="34" rx="17" fill="{FAINT}" fill-opacity="0.7" stroke="{RULE}"/>'
                  f'<text x="{cx+w/2:.1f}" y="334" text-anchor="middle">{label}</text>')
        cx += w + 10
    return AGPL_SVG + f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="title"><!-- {FA_ATTR} --><!-- Lettering: Inter (The Inter Project Authors), OFL-1.1 - https://openfontlicense.org -->
  <title id="title">Dunceious - Because geniality is overpriced.</title>
  <defs>
    <clipPath id="card"><rect width="{W}" height="{H}" rx="24"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{SLATE}"/><stop offset="0.6" stop-color="{VOID}"/></linearGradient>
    <radialGradient id="glow" cx="22%" cy="50%" r="55%"><stop offset="0" stop-color="{SKY}" stop-opacity="0.16"/><stop offset="1" stop-color="{SKY}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="78%" cy="55%" r="40%"><stop offset="0" stop-color="{CYAN}" stop-opacity="0.12"/><stop offset="1" stop-color="{CYAN}" stop-opacity="0"/></radialGradient>
    <linearGradient id="dnamark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GRAD_TOP}"/><stop offset="1" stop-color="{GRAD_BOT}"/></linearGradient>
  </defs>
  <g clip-path="url(#card)">
    <rect width="{W}" height="{H}" fill="url(#bg)"/>
    <g stroke="{FAINT}" stroke-width="1" opacity="0.45">{grid}</g>
    <rect width="{W}" height="{H}" fill="url(#glow)"/>
    <rect width="{W}" height="{H}" fill="url(#glow2)"/>
    {helix(790, W + 40, 214, 76, 300, 150)}
  </g>
  <rect x="0.75" y="0.75" width="{W-1.5}" height="{H-1.5}" rx="23.25" fill="none" stroke="{SKY}" stroke-opacity="0.25" stroke-width="1.5"/>
  {dna_group("url(#dnamark)", ML+14, 92, 34)}
  <text x="{ML+42}" y="99" fill="{SKY_HI}" font-family="{MONO_STACK}" font-weight="500" font-size="16" letter-spacing="6">BROWSER-NATIVE&#160;GENOMICS</text>
  <rect x="{W-ML-232}" y="70" width="232" height="38" rx="19" fill="{VOID}" fill-opacity="0.6" stroke="{SKY}" stroke-opacity="0.5"/>
  <text x="{W-ML-116}" y="95" fill="{SKY_HI}" font-family="{MONO_STACK}" font-size="15" letter-spacing="1.5" text-anchor="middle">NOTHING&#160;IS&#160;STORED</text>
  {wordmark}
  {slogan}{dot}
  <g font-family="{MONO_STACK}" font-size="15" fill="#cbd5e1">{chips}</g>
</svg>
'''


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
    with open(os.path.join(DOCS_ASSETS, "readme-banner.svg"), "w") as f:
        f.write(readme_banner())
    print("Wrote public/{favicon.svg, favicon-32.png, apple-touch-icon.png, og-image.png}, "
          "docs/assets/readme-banner.svg")


if __name__ == "__main__":
    main()
