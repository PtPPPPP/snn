"""Make small, exact-glyph SNN Grid subsets for the site and its home page.

The larger existing subsets remain in the CSS as fallbacks. Run from any
directory with fontTools and brotli installed when site copy changes enough to
justify rebuilding these optional subsets.
"""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'public' / 'fonts'
SOURCE = FONTS / 'snn-grid.woff2'
START = '/* BEGIN FAST SITE FONT SUBSETS */'
END = '/* END FAST SITE FONT SUBSETS */'

home_paths = [
    'app/design/unified-preview/production-home.tsx',
    'app/design/unified-preview/preview-network.tsx',
    'app/design/unified-preview/unified-preview.module.css',
    'app/_sections/UnifiedNav.tsx', 'app/_sections/UnifiedNav.module.css',
    'app/_sections/data.ts', 'app/globals.css', 'app/layout.tsx', 'lib/site.ts',
]

def collect(paths):
    characters = set()
    for path in paths:
        try:
            characters.update(ord(ch) for ch in path.read_text(encoding='utf-8') if ord(ch) >= 32)
        except (OSError, UnicodeDecodeError):
            continue
    return characters

def ranges(points):
    spans = []
    for point in sorted(points):
        if spans and point == spans[-1][1] + 1:
            spans[-1][1] = point
        else:
            spans.append([point, point])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in spans)

font = TTFont(SOURCE, lazy=True)
supported = set(font.getBestCmap())
font.close()
site_paths = []
for directory in ('app', 'lib', 'shared'):
    base = ROOT / directory
    if base.exists():
        site_paths.extend(path for path in base.rglob('*') if path.is_file()
                          and path.suffix in ('.tsx', '.ts', '.js', '.mjs', '.css')
                          and path.stat().st_size < 1_000_000)
home = (collect(ROOT / path for path in home_paths) | set(range(32, 127))) & supported
# The home face is also available on the rest of the site.  Keep only the
# additional glyphs here so visitors do not download shared outlines twice.
site = (collect(site_paths) & supported) - home
course_paths = []
for directory in ('app/learn/neural-networks', 'lib/learning'):
    base = ROOT / directory
    if base.exists():
        course_paths.extend(path for path in base.rglob('*') if path.is_file()
                            and path.suffix in ('.tsx', '.ts', '.js', '.mjs', '.css')
                            and path.stat().st_size < 1_000_000)
course = collect(course_paths) & site
site -= course

def make_face(name, points):
    font = TTFont(SOURCE)
    font.recalcTimestamp = False
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.notdef_glyph = True
    options.notdef_outline = True
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=sorted(points))
    sub.subset(font)
    actual = set(font.getBestCmap())
    font.flavor = 'woff2'
    buffer = BytesIO()
    font.save(buffer)
    font.close()
    data = buffer.getvalue()
    filename = f'snn-grid-{name}-{sha256(data).hexdigest()[:12]}.woff2'
    (FONTS / filename).write_bytes(data)
    print(f'{name}: {len(actual)} characters, {len(data)} bytes, {filename}', flush=True)
    rule = ('@font-face {\n  font-family: "SNN Grid";\n  font-style: normal;\n'
            '  font-weight: 400;\n  font-display: swap;\n'
            f'  src: url("/fonts/{filename}") format("woff2");\n'
            f'  unicode-range: {ranges(actual)};\n}}')
    return rule, filename

site_face, site_file = make_face('site', site)
course_face, course_file = make_face('course', course)
home_face, home_file = make_face('home', home)
faces = [site_face, course_face, home_face]
css_path = FONTS / 'snn-grid.css'
css = css_path.read_text(encoding='utf-8')
if START in css:
    before, tail = css.split(START, 1)
    _, after = tail.split(END, 1)
    css = before.rstrip() + '\n' + after.lstrip()
css_path.write_text(css.rstrip() + '\n\n' + START + '\n' + '\n\n'.join(faces) + '\n' + END + '\n', encoding='utf-8')
(ROOT / 'lib' / 'design' / 'fast-fonts.json').write_text(
    json.dumps({'home': '/fonts/' + home_file, 'course': '/fonts/' + course_file,
                'site': '/fonts/' + site_file}, indent=2) + '\n',
    encoding='utf-8',
)
