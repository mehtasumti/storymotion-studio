"""Generates original illustrated scene images for the StoryMotion demo project.

Six 9:16 SVG scenes are rendered with Chromium and saved as WebP.
Usage: python scripts/make-demo-scenes.py public/demo   (needs Pillow + Playwright; optional CHROMIUM_PATH)
"""
import asyncio
import os
import random
import sys
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

W, H = 900, 1600
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

GRAIN = """
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix type="saturate" values="0"/>
  <feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer>
  <feBlend in2="SourceGraphic" mode="overlay"/>
</filter>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
<filter id="softer" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="50"/></filter>
<filter id="blur4"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="blur2"><feGaussianBlur stdDeviation="2"/></filter>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%">
  <stop offset="55%" stop-color="#000" stop-opacity="0"/>
  <stop offset="100%" stop-color="#000" stop-opacity="0.75"/>
</radialGradient>
"""


def wrap(body, defs=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>{GRAIN}{defs}</defs>
<g filter="url(#grain)">{body}<rect width="{W}" height="{H}" fill="url(#vignette)"/></g>
</svg>"""


def rain(seed, count=260, x0=0, x1=W, y0=0, y1=H, color="#c9c3ff", opacity=0.22, slant=-0.18, length=(40, 90), width=1.6):
    r = random.Random(seed)
    lines = []
    for _ in range(count):
        x = r.uniform(x0, x1)
        y = r.uniform(y0, y1)
        ln = r.uniform(*length)
        o = opacity * r.uniform(0.4, 1.0)
        lines.append(
            f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x + ln * slant:.1f}" y2="{y + ln:.1f}" stroke="{color}" stroke-opacity="{o:.2f}" stroke-width="{width}" stroke-linecap="round"/>'
        )
    return "".join(lines)


def motes(seed, count, cx, cy, rx, ry, color="#ffe6b0"):
    r = random.Random(seed)
    out = []
    for _ in range(count):
        x = cx + r.gauss(0, rx)
        y = cy + r.gauss(0, ry)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r.uniform(1, 3.2):.1f}" fill="{color}" opacity="{r.uniform(0.15, 0.6):.2f}"/>')
    return "".join(out)


def stars(seed, count, y1):
    r = random.Random(seed)
    return "".join(
        f'<circle cx="{r.uniform(0, W):.0f}" cy="{r.uniform(0, y1):.0f}" r="{r.uniform(0.6, 1.8):.1f}" fill="#fff" opacity="{r.uniform(0.2, 0.8):.2f}"/>'
        for _ in range(count)
    )


def figure(x, y, s=1.0, fill="#05040a"):
    """Woman in a long trench coat, seen from behind (silhouette). (x, y) = feet centre."""
    return f"""<g transform="translate({x} {y}) scale({s})" fill="{fill}">
  <path d="M-58 0 L-46 -250 Q-44 -300 -30 -330 L30 -330 Q44 -300 46 -250 L60 0 Z"/>
  <path d="M-34 -330 Q-62 -320 -66 -270 L-60 -170 L-44 -170 L-40 -260 Z"/>
  <path d="M34 -330 Q62 -320 66 -270 L60 -170 L44 -170 L40 -260 Z"/>
  <rect x="-12" y="-352" width="24" height="26" rx="8"/>
  <ellipse cx="0" cy="-382" rx="30" ry="36"/>
  <path d="M-30 -392 Q-40 -330 -26 -300 Q-8 -322 0 -330 Q8 -322 26 -300 Q40 -330 30 -392 Q0 -440 -30 -392 Z"/>
  <rect x="-30" y="-6" width="22" height="10" rx="4"/><rect x="10" y="-6" width="22" height="10" rx="4"/>
</g>"""


def man(x, y, s=1.0, fill="#020205"):
    """Tall man silhouette, facing the viewer. (x, y) = feet centre."""
    return f"""<g transform="translate({x} {y}) scale({s})" fill="{fill}">
  <path d="M-34 0 L-30 -200 L-48 -210 L-56 -380 Q-50 -420 -20 -428 L20 -428 Q50 -420 56 -380 L48 -210 L30 -200 L34 0 L8 0 L4 -190 L-4 -190 L-8 0 Z"/>
  <path d="M-56 -380 L-70 -230 L-56 -228 L-46 -330 Z"/><path d="M56 -380 L70 -230 L56 -228 L46 -330 Z"/>
  <rect x="-11" y="-448" width="22" height="24" rx="6"/>
  <ellipse cx="0" cy="-476" rx="27" ry="33"/>
  <path d="M-28 -486 Q-22 -516 0 -516 Q24 -516 28 -486 Q12 -498 -28 -486 Z"/>
</g>"""


# ---------------------------------------------------------------- scene 1 --
def scene1():
    defs = """
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14112a"/><stop offset="1" stop-color="#0a0915"/></linearGradient>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1747"/><stop offset="0.6" stop-color="#3a2a7a"/><stop offset="1" stop-color="#6b4fb8"/></linearGradient>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120e1c"/><stop offset="1" stop-color="#241a2c"/></linearGradient>
<radialGradient id="spill" cx="55%" cy="0%" r="75%"><stop offset="0" stop-color="#ffcf86" stop-opacity="0.85"/><stop offset="0.5" stop-color="#ff9f4a" stop-opacity="0.25"/><stop offset="1" stop-color="#ff9f4a" stop-opacity="0"/></radialGradient>
<linearGradient id="door" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f1520"/><stop offset="1" stop-color="#2b1d26"/></linearGradient>
<clipPath id="floorclip"><rect x="0" y="1060" width="900" height="540"/></clipPath>
<clipPath id="win"><rect x="70" y="220" width="250" height="560" rx="125"/></clipPath>
"""
    floor_lines = "".join(
        f'<line x1="{450 + (i - 8) * 30}" y1="1060" x2="{450 + (i - 8) * 160}" y2="1600" stroke="#000" stroke-opacity="0.35" stroke-width="3"/>'
        for i in range(17)
    )
    city = "".join(
        f'<rect x="{70 + i * 22}" y="{700 - (i * 37 % 120)}" width="18" height="{80 + (i * 37 % 120)}" fill="#120f2a"/>'
        for i in range(12)
    )
    lit = "".join(
        f'<rect x="{76 + (i * 53) % 230}" y="{640 + (i * 29) % 120}" width="5" height="7" fill="#ffd37a" opacity="0.8"/>'
        for i in range(18)
    )
    body = f"""
<rect width="{W}" height="{H}" fill="url(#wall)"/>
<!-- window -->
<g clip-path="url(#win)"><rect x="70" y="220" width="250" height="560" fill="url(#night)"/>
<circle cx="250" cy="330" r="46" fill="#efe9ff" opacity="0.9"/><circle cx="250" cy="330" r="110" fill="#b9a8ff" opacity="0.2" filter="url(#soft)"/>
{city}{lit}{rain(11, 90, 70, 320, 220, 780, '#e6e0ff', 0.45, -0.1, (30, 60), 1.4)}</g>
<rect x="70" y="220" width="250" height="560" rx="125" fill="none" stroke="#2c2440" stroke-width="16"/>
<line x1="195" y1="230" x2="195" y2="780" stroke="#2c2440" stroke-width="10"/><line x1="78" y1="520" x2="312" y2="520" stroke="#2c2440" stroke-width="10"/>
<path d="M70 780 L320 780 L340 1060 L50 1060 Z" fill="#6b4fb8" opacity="0.08"/>
<!-- door -->
<rect x="440" y="300" width="380" height="760" fill="#0c0a12"/>
<rect x="456" y="316" width="348" height="736" fill="url(#door)"/>
<rect x="490" y="360" width="130" height="300" rx="6" fill="none" stroke="#3d2b33" stroke-width="6"/>
<rect x="640" y="360" width="130" height="300" rx="6" fill="none" stroke="#3d2b33" stroke-width="6"/>
<rect x="490" y="700" width="130" height="300" rx="6" fill="none" stroke="#3d2b33" stroke-width="6"/>
<rect x="640" y="700" width="130" height="300" rx="6" fill="none" stroke="#3d2b33" stroke-width="6"/>
<circle cx="500" cy="690" r="14" fill="#c9a25a"/><circle cx="500" cy="690" r="30" fill="#ffcf86" opacity="0.15" filter="url(#blur4)"/>
<!-- floor -->
<rect x="0" y="1060" width="{W}" height="540" fill="url(#floor)"/>{floor_lines}
<rect x="456" y="1052" width="348" height="8" fill="#ffd79a"/>
<g clip-path="url(#floorclip)"><path d="M456 1060 L804 1060 L980 1600 L250 1600 Z" fill="url(#spill)" opacity="0.7"/></g>
<!-- envelope -->
<g transform="translate(560 1190) rotate(-9)">
  <rect x="-120" y="-70" width="240" height="140" rx="6" fill="#efe2c4"/>
  <path d="M-120 -70 L0 18 L120 -70" fill="none" stroke="#c7b48f" stroke-width="5"/>
  <path d="M-120 70 L-30 0 M120 70 L30 0" stroke="#d9c8a5" stroke-width="3"/>
  <circle cx="0" cy="18" r="20" fill="#8e1c2b"/><circle cx="0" cy="18" r="11" fill="none" stroke="#b5384a" stroke-width="3"/>
</g>
<ellipse cx="560" cy="1270" rx="160" ry="22" fill="#000" opacity="0.35" filter="url(#blur4)"/>
{rain(12, 40, 0, W, 0, 220, '#8f86c9', 0.08)}
"""
    return wrap(body, defs)


# ---------------------------------------------------------------- scene 2 --
def scene2():
    defs = """
<linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1a14"/><stop offset="1" stop-color="#120a08"/></linearGradient>
<radialGradient id="candle" cx="78%" cy="18%" r="70%"><stop offset="0" stop-color="#ffc56b" stop-opacity="0.7"/><stop offset="0.45" stop-color="#ff8a3d" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3e6c8"/><stop offset="1" stop-color="#cdb68c"/></linearGradient>
<linearGradient id="flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a1a"/><stop offset="0.5" stop-color="#ffd166"/><stop offset="1" stop-color="#fff6d6"/></linearGradient>
"""
    grain_lines = "".join(
        f'<path d="M0 {i * 70 + 20} Q300 {i * 70 + 40} 600 {i * 70 + 10} T{W} {i * 70 + 30}" stroke="#000" stroke-opacity="0.18" stroke-width="3" fill="none"/>'
        for i in range(24)
    )
    r = random.Random(5)
    script = []
    for row in range(14):
        y = 520 + row * 48
        x = 210
        segs = []
        while x < 640:
            w = r.uniform(30, 90)
            segs.append(f"M{x:.0f} {y} q{w / 4:.0f} -{r.uniform(6, 14):.0f} {w / 2:.0f} 0 t{w / 2:.0f} 0")
            x += w + r.uniform(10, 18)
        if row in (0, 13):
            segs = segs[: max(2, len(segs) // 2)]
        script.append(f'<path d="{" ".join(segs)}" fill="none" stroke="#3b2a22" stroke-width="3.2" stroke-linecap="round" opacity="0.8"/>')
    body = f"""
<rect width="{W}" height="{H}" fill="url(#desk)"/>{grain_lines}
<rect width="{W}" height="{H}" fill="url(#candle)"/>
<!-- letter -->
<g transform="rotate(-6 450 860)">
  <rect x="170" y="400" width="520" height="860" fill="#000" opacity="0.45" filter="url(#soft)" transform="translate(18 24)"/>
  <rect x="170" y="400" width="520" height="860" fill="url(#paper)"/>
  <path d="M170 830 L690 830" stroke="#b59d73" stroke-width="2" opacity="0.6"/>
  <path d="M210 460 q20 -14 40 0 t40 0 t40 0" fill="none" stroke="#3b2a22" stroke-width="4" stroke-linecap="round"/>
  {"".join(script)}
  <path d="M480 1180 q30 -30 60 0 q20 18 50 -10" fill="none" stroke="#3b2a22" stroke-width="4" stroke-linecap="round"/>
  <rect x="170" y="400" width="520" height="860" fill="none" stroke="#a88e62" stroke-width="2"/>
</g>
<!-- pendant -->
<path d="M560 1300 C620 1330 700 1300 760 1220" fill="none" stroke="#cfd3dc" stroke-width="3" stroke-dasharray="2 5" opacity="0.9"/>
<g transform="translate(560 1310)"><circle r="40" fill="#dfe3ec"/><circle cx="16" cy="-8" r="36" fill="url(#desk)"/><circle r="40" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="2"/></g>
<circle cx="540" cy="1295" r="10" fill="#fff" opacity="0.7" filter="url(#blur2)"/>
<!-- candle -->
<ellipse cx="720" cy="430" rx="90" ry="22" fill="#000" opacity="0.4"/>
<rect x="680" y="250" width="80" height="180" rx="6" fill="#efe3cf"/>
<path d="M680 262 q40 22 80 0" fill="#d8c8ad"/>
<line x1="720" y1="250" x2="720" y2="226" stroke="#1a1208" stroke-width="4"/>
<circle cx="720" cy="190" r="150" fill="#ffb54d" opacity="0.28" filter="url(#softer)"/>
<path d="M720 120 C750 170 744 222 720 230 C696 222 690 170 720 120 Z" fill="url(#flame)"/>
<path d="M720 170 C730 190 728 214 720 220 C712 214 710 190 720 170 Z" fill="#6aa8ff" opacity="0.5"/>
{motes(21, 40, 720, 300, 160, 160)}
"""
    return wrap(body, defs)


# ---------------------------------------------------------------- scene 3 --
def scene3():
    defs = """
<linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a1f"/><stop offset="0.45" stop-color="#2c1f63"/><stop offset="0.75" stop-color="#5a3e9e"/><stop offset="1" stop-color="#1a1430"/></linearGradient>
<radialGradient id="flash" cx="35%" cy="18%" r="60%"><stop offset="0" stop-color="#d9d0ff" stop-opacity="0.55"/><stop offset="1" stop-color="#d9d0ff" stop-opacity="0"/></radialGradient>
<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#130f24"/><stop offset="1" stop-color="#07060e"/></linearGradient>
"""
    windows = "".join(
        f'<rect x="{x}" y="{y}" width="14" height="22" fill="{c}"/>'
        for x, y, c in [
            (382, 760, "#ffcc73"), (420, 760, "#1c1730"), (458, 760, "#1c1730"), (496, 760, "#ffcc73"),
            (382, 810, "#1c1730"), (420, 810, "#ffcc73"), (458, 810, "#1c1730"), (496, 810, "#1c1730"),
            (300, 800, "#1c1730"), (590, 800, "#ffcc73"),
        ]
    )
    bars = ""
    for i in range(15):
        x = 40 + i * 58
        bars += f'<rect x="{x}" y="900" width="12" height="700" fill="#050409"/><path d="M{x - 8} 905 L{x + 6} 860 L{x + 20} 905 Z" fill="#050409"/>'
    body = f"""
<rect width="{W}" height="{H}" fill="url(#sky3)"/>
{stars(3, 60, 500)}
<rect width="{W}" height="{H}" fill="url(#flash)"/>
<circle cx="680" cy="300" r="70" fill="#f1ecff"/><circle cx="680" cy="300" r="200" fill="#b8a6ff" opacity="0.25" filter="url(#softer)"/>
<path d="M0 360 Q200 300 420 360 T900 330 L900 470 Q640 420 420 470 T0 450 Z" fill="#1a1440" opacity="0.85"/>
<path d="M500 250 Q640 210 900 260 L900 330 Q700 290 520 320 Z" fill="#221a52" opacity="0.8"/>
<!-- lightning -->
<path d="M300 0 L330 120 L290 130 L350 290 L318 300 L380 470" fill="none" stroke="#f4f0ff" stroke-width="6" stroke-linejoin="round"/>
<path d="M300 0 L330 120 L290 130 L350 290 L318 300 L380 470" fill="none" stroke="#c7b8ff" stroke-width="22" opacity="0.35" filter="url(#blur4)"/>
<!-- mansion -->
<path d="M0 960 Q220 860 450 880 T900 930 L900 1600 L0 1600 Z" fill="url(#hill)"/>
<g fill="#0b0916">
  <rect x="280" y="740" width="340" height="160"/>
  <path d="M270 745 L450 640 L630 745 Z"/>
  <rect x="250" y="700" width="70" height="200"/><path d="M240 705 L285 620 L330 705 Z"/>
  <rect x="580" y="690" width="70" height="210"/><path d="M570 695 L615 600 L660 695 Z"/>
  <rect x="430" y="590" width="40" height="70"/><path d="M425 595 L450 540 L475 595 Z"/>
  <rect x="340" y="660" width="14" height="40"/><rect x="540" y="660" width="14" height="40"/>
</g>
{windows}
<!-- path & figure -->
<path d="M390 1600 L440 960 L470 960 L560 1600 Z" fill="#191428" opacity="0.9"/>
{figure(470, 1450, 0.95, '#030207')}
<!-- gate -->
{bars}
<rect x="0" y="1010" width="{W}" height="14" fill="#050409"/><rect x="0" y="1220" width="{W}" height="14" fill="#050409"/>
<path d="M330 900 Q450 780 570 900" fill="none" stroke="#050409" stroke-width="16"/>
<circle cx="450" cy="842" r="22" fill="none" stroke="#050409" stroke-width="10"/>
<rect x="436" y="880" width="28" height="720" fill="#050409"/>
{rain(31, 320, 0, W, 0, H, '#d6ceff', 0.28, -0.22, (50, 110), 1.6)}
"""
    return wrap(body, defs)


# ---------------------------------------------------------------- scene 4 --
def scene4():
    defs = """
<linearGradient id="hall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140f22"/><stop offset="1" stop-color="#0a0812"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cbbcff" stop-opacity="0.32"/><stop offset="1" stop-color="#cbbcff" stop-opacity="0"/></linearGradient>
<radialGradient id="chand" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd38a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd38a" stop-opacity="0"/></radialGradient>
<linearGradient id="portrait" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a4d"/><stop offset="1" stop-color="#1c1426"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b26a"/><stop offset="0.5" stop-color="#8a6a33"/><stop offset="1" stop-color="#c79d55"/></linearGradient>
"""
    steps = ""
    for i in range(16):
        y = 1580 - i * 52
        x0 = 120 + i * 30
        steps += f'<rect x="{x0}" y="{y}" width="{720 - i * 20}" height="52" fill="{["#1b1426", "#150f1f"][i % 2]}"/>'
        steps += f'<rect x="{x0}" y="{y}" width="{720 - i * 20}" height="5" fill="#2e2340"/>'
    balusters = "".join(
        f'<rect x="{150 + i * 30}" y="{1500 - i * 52}" width="8" height="120" fill="#0a0710"/>' for i in range(15)
    )
    body = f"""
<rect width="{W}" height="{H}" fill="url(#hall)"/>
<!-- tall window + beam -->
<rect x="640" y="160" width="180" height="520" rx="90" fill="#2a2153"/>
<rect x="640" y="160" width="180" height="520" rx="90" fill="none" stroke="#0e0a18" stroke-width="14"/>
<line x1="730" y1="170" x2="730" y2="680" stroke="#0e0a18" stroke-width="8"/>
<path d="M640 300 L820 300 L560 1600 L-200 1600 Z" fill="url(#beam)"/>
<!-- chandelier -->
<line x1="330" y1="0" x2="330" y2="250" stroke="#0a0710" stroke-width="6"/>
<circle cx="330" cy="330" r="200" fill="url(#chand)"/>
<path d="M200 300 Q330 400 460 300" fill="none" stroke="#0a0710" stroke-width="8"/>
<path d="M240 270 Q330 340 420 270" fill="none" stroke="#0a0710" stroke-width="6"/>
{''.join(f'<rect x="{x - 4}" y="{y - 26}" width="8" height="24" fill="#f1e2c4"/><circle cx="{x}" cy="{y - 34}" r="6" fill="#ffd38a"/>' for x, y in [(200, 300), (250, 330), (300, 346), (360, 346), (410, 330), (460, 300)])}
<path d="M290 360 L330 430 L370 360" fill="#0a0710"/>
<!-- portrait -->
<g transform="translate(330 820)">
  <rect x="-150" y="-200" width="300" height="400" rx="10" fill="url(#gold)"/>
  <rect x="-128" y="-178" width="256" height="356" fill="url(#portrait)"/>
  <ellipse cx="0" cy="-50" rx="54" ry="66" fill="#0f0a16"/>
  <path d="M-58 -70 Q-70 30 -40 60 L40 60 Q70 30 58 -70 Q0 -150 -58 -70 Z" fill="#0f0a16"/>
  <path d="M-110 178 Q-100 40 0 30 Q100 40 110 178 Z" fill="#0f0a16"/>
  <path d="M-34 60 Q0 100 34 60" fill="none" stroke="#cfd3dc" stroke-width="2" opacity="0.8"/>
  <circle cx="0" cy="100" r="9" fill="#e9edf5"/><circle cx="4" cy="97" r="8" fill="#0f0a16"/>
  <circle cx="-2" cy="98" r="22" fill="#e9edf5" opacity="0.35" filter="url(#blur4)"/>
</g>
<!-- staircase -->
{steps}{balusters}
<path d="M140 1440 L590 660" stroke="#0a0710" stroke-width="16"/>
{motes(41, 90, 380, 1000, 220, 360, '#e7ddff')}
"""
    return wrap(body, defs)


# ---------------------------------------------------------------- scene 5 --
def scene5():
    defs = """
<linearGradient id="corr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a14"/><stop offset="1" stop-color="#05050a"/></linearGradient>
<radialGradient id="door5" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#f3f0ff"/><stop offset="0.6" stop-color="#b9adff"/><stop offset="1" stop-color="#6c5cd6"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#a99bff" stop-opacity="0.55"/><stop offset="1" stop-color="#a99bff" stop-opacity="0"/></radialGradient>
<linearGradient id="spill5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfb2ff" stop-opacity="0.45"/><stop offset="1" stop-color="#bfb2ff" stop-opacity="0"/></linearGradient>
<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c90e0" stop-opacity="0"/><stop offset="1" stop-color="#9c90e0" stop-opacity="0.22"/></linearGradient>
"""
    body = f"""
<rect width="{W}" height="{H}" fill="url(#corr)"/>
<!-- corridor perspective -->
<path d="M0 0 L330 520 L330 1060 L0 1600 Z" fill="#0f0d1b"/>
<path d="M900 0 L570 520 L570 1060 L900 1600 Z" fill="#0d0b18"/>
<path d="M0 1600 L330 1060 L570 1060 L900 1600 Z" fill="#100d1a"/>
{''.join(f'<path d="M{330 - (330 * k):.0f} {520 - 520 * k:.0f} L{330 - (330 * k):.0f} {1060 + 540 * k:.0f}" stroke="#1d1830" stroke-width="{4 + 8 * k:.0f}"/>' for k in (0.25, 0.5, 0.8))}
{''.join(f'<path d="M{570 + (330 * k):.0f} {520 - 520 * k:.0f} L{570 + (330 * k):.0f} {1060 + 540 * k:.0f}" stroke="#1a152b" stroke-width="{4 + 8 * k:.0f}"/>' for k in (0.25, 0.5, 0.8))}
<circle cx="450" cy="790" r="420" fill="url(#halo)"/>
<rect x="355" y="560" width="190" height="500" fill="url(#door5)"/>
<path d="M355 1060 L545 1060 L900 1600 L0 1600 Z" fill="url(#spill5)"/>
{man(450, 1058, 0.98)}
<!-- long shadow -->
<path d="M425 1060 L475 1060 L560 1600 L340 1600 Z" fill="#020205" opacity="0.85"/>
<rect x="0" y="900" width="{W}" height="700" fill="url(#fog)"/>
{motes(51, 60, 450, 800, 160, 260, '#ffffff')}
"""
    return wrap(body, defs)


# ---------------------------------------------------------------- scene 6 --
def scene6():
    defs = """
<linearGradient id="hall6" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0a17"/><stop offset="1" stop-color="#05040a"/></linearGradient>
<linearGradient id="door6" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a1220"/><stop offset="1" stop-color="#22172a"/></linearGradient>
<linearGradient id="moon6" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bdb1ff" stop-opacity="0.4"/><stop offset="1" stop-color="#bdb1ff" stop-opacity="0"/></linearGradient>
"""
    candles = ""
    for i, x in enumerate([150, 300, 600, 750]):
        candles += f'<rect x="{x - 14}" y="760" width="28" height="90" rx="4" fill="#d9ccb4" opacity="0.85"/><rect x="{x - 40}" y="846" width="80" height="12" rx="4" fill="#2a2030"/><line x1="{x}" y1="760" x2="{x}" y2="748" stroke="#111" stroke-width="3"/>'
        candles += f'<circle cx="{x}" cy="748" r="3" fill="#ff8a3d" opacity="0.9"/>'
        r = random.Random(60 + i)
        d = f"M{x} 745"
        y = 745
        for k in range(6):
            y -= r.uniform(40, 70)
            d += f" Q{x + r.uniform(-50, 50):.0f} {y + 25:.0f} {x + r.uniform(-25, 25):.0f} {y:.0f}"
        candles += f'<path d="{d}" fill="none" stroke="#cfc7ee" stroke-width="5" stroke-linecap="round" opacity="0.35" filter="url(#blur2)"/>'
    body = f"""
<rect width="{W}" height="{H}" fill="url(#hall6)"/>
<!-- door -->
<path d="M260 1120 L260 470 Q450 300 640 470 L640 1120 Z" fill="#07050c"/>
<path d="M280 1120 L280 480 Q450 330 620 480 L620 1120 Z" fill="url(#door6)"/>
<line x1="450" y1="380" x2="450" y2="1120" stroke="#0b0710" stroke-width="8"/>
{''.join(f'<line x1="280" y1="{y}" x2="620" y2="{y}" stroke="#0b0710" stroke-width="10"/>' for y in (600, 860))}
{''.join(f'<circle cx="{x}" cy="{y}" r="7" fill="#3a2e3c"/>' for x in (310, 420, 480, 590) for y in (600, 860))}
<circle cx="500" cy="760" r="34" fill="none" stroke="#6e5a44" stroke-width="9"/><circle cx="500" cy="726" r="9" fill="#6e5a44"/>
<!-- moonlight sliver -->
<path d="M620 1120 L640 470 L900 1600 L700 1600 Z" fill="url(#moon6)"/>
<rect x="0" y="1120" width="{W}" height="480" fill="#0b0912"/>
<path d="M0 1120 L{W} 1120" stroke="#1b1628" stroke-width="4"/>
{candles}
{figure(250, 1600, 1.35, '#010103')}
"""
    return wrap(body, defs)


SCENES = [scene1, scene2, scene3, scene4, scene5, scene6]


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
        page = await browser.new_page(viewport={"width": W, "height": H})
        for i, fn in enumerate(SCENES, start=1):
            svg = fn()
            (OUT / f"scene-{i}.svg").write_text(svg)
            await page.set_content(f"<html><body style='margin:0;background:#000'>{svg}</body></html>")
            png = OUT / f"scene-{i}.png"
            await page.screenshot(path=str(png), clip={"x": 0, "y": 0, "width": W, "height": H})
            img = Image.open(png).convert("RGB").resize((720, 1280), Image.LANCZOS)
            img.save(OUT / f"scene-{i}.webp", "WEBP", quality=82, method=6)
            print(i, (OUT / f"scene-{i}.webp").stat().st_size)
        await browser.close()


asyncio.run(main())
