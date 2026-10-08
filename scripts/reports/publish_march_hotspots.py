"""Publish the reviewed September report and its linked evidence, without captures."""
from pathlib import Path
from html.parser import HTMLParser
from collections import deque
import base64
import gzip
import hashlib
import html
import json
import re
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/march_dual_hotspots_20260910_215916'
PUBLIC = ROOT / 'web/public/report'
ID = 'march-dual-hotspots-20260910'
DEST = PUBLIC / ID
BASE = '/cpu/report/' + ID + '/'
CAPTURE_SUFFIXES = {'.raw', '.pdata', '.zip'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'utf8')


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        for key in ('src', 'href'):
            if attrs.get(key) and not attrs[key].startswith('data:'):
                self.urls.append(attrs[key])


def relative_target(page, url):
    parts = urllib.parse.urlsplit(html.unescape(url))
    if parts.scheme or parts.netloc or not parts.path:
        return None
    target = (page.parent / urllib.parse.unquote(parts.path)).resolve()
    assert target.is_relative_to(SOURCE.resolve()), (page, url)
    assert target.exists(), (page, url)
    return target


source_bytes = (SOURCE / 'report.html').read_bytes()
source_manifest = json.loads((SOURCE / 'standalone-validation.json').read_text('utf8'))
assert sha(source_bytes) == source_manifest['sha256'], 'Reviewed report changed'
DEST.mkdir(parents=True, exist_ok=True)
queue = deque([SOURCE / 'report.html'])
visited = set()
files = {}
transforms = []
local_links = []
image_proof = []
legacy_tree_queries = []
source_tree_markers = {}


def save(relative, data):
    path = DEST / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    files[relative] = {'file': relative, 'bytes': len(data), 'sha256': sha(data)}


def exact_gzip(relative, raw):
    existing = DEST / relative
    if existing.is_file():
        data = existing.read_bytes()
        if gzip.decompress(data) == raw:
            return data
    data = gzip.compress(raw, compresslevel=9, mtime=0)
    assert gzip.decompress(data) == raw
    return data


def rewrite_link(match, page):
    tag, attrs = match.group(1), match.group(2)
    parsed = re.search(r'\b(?:href|src)\s*=\s*(["\x27])(.*?)\1', attrs, re.S)
    if not parsed:
        return match[0]
    value = html.unescape(parsed[2])
    parts = urllib.parse.urlsplit(value)
    if page == SOURCE / 'report.html' and parts.path in files:
        return match[0]
    target = relative_target(page, value)
    if target and target.suffix == '.html' and parts.fragment:
        if target not in source_tree_markers:
            tree_text = target.read_text('utf8')
            tree_match = re.search(r'<script id="treedata"[^>]*>(.*?)</script>', tree_text, re.S)
            source_tree_markers[target] = ([v['marker'].lower() for v in json.loads(tree_match[1])['nodes']]
                                          if tree_match else None)
        markers = source_tree_markers[target]
        fragment = urllib.parse.unquote(parts.fragment)
        if markers and not any(fragment.lower() in marker for marker in markers):
            # Some legacy links use a business group label as a marker query.
            # Keep the complete proof page and use a real query, or show the tree unfiltered.
            choices = ['SystemGroup'] if fragment.startswith('ECS:') else fragment.split(' + ')
            query = next((q for q in choices if any(q.lower() in marker for marker in markers)), '')
            replacement = parts.path + ('#' + urllib.parse.quote(query) if query else '')
            legacy_tree_queries.append({'page': page.relative_to(SOURCE).as_posix(),
                                        'originalHref': value, 'publishedHref': replacement})
            attrs = attrs[:parsed.start(2)] + html.escape(replacement, quote=True) + attrs[parsed.end(2):]
            return '<' + tag + attrs + '>'
    if parts.scheme == 'file' or (target and (target.is_dir() or target.suffix in CAPTURE_SUFFIXES)):
        assert tag.lower() == 'a', (page, value)
        local_links.append({'page': page.relative_to(SOURCE).as_posix(), 'originalHref': value})
        attrs = attrs[:parsed.start()] + attrs[parsed.end():]
        # Keep the path and label available without sending a broken HTTP request.
        attrs += ' data-local-original="' + html.escape(value, quote=True) + '"'
        attrs += ' title="采集机本地原件：' + html.escape(value, quote=True) + '"'
        attrs += ' aria-disabled="true" style="color:#8fa8c4;cursor:default"'
        return '<' + tag + attrs + '>'
    if target and target.suffix == '.json':
        # These JSON links are downloads, not runtime input to the tree viewers.
        replacement = parts.path + '.gz'
        if parts.fragment:
            replacement += '#' + parts.fragment
        attrs = attrs[:parsed.start(2)] + html.escape(replacement, quote=True) + attrs[parsed.end(2):]
        if tag.lower() == 'a':
            attrs += ' download title="完整JSON数据，gzip无损压缩；解压后查看"'
        return '<' + tag + attrs + '>'
    return match[0]


while queue:
    page = queue.popleft()
    if page in visited:
        continue
    visited.add(page)
    relative = page.relative_to(SOURCE).as_posix()
    raw = page.read_bytes()
    if page.suffix != '.html':
        if page.suffix == '.json':
            encoded = exact_gzip(relative + '.gz', raw)
            save(relative + '.gz', encoded)
            transforms.append({'source': relative, 'published': relative + '.gz',
                               'sourceBytes': len(raw), 'sourceSha256': sha(raw), 'roundTripExact': True})
        else:
            save(relative, raw)
        continue
    text = raw.decode('utf8')
    parser = Links()
    parser.feed(text)
    for url in parser.urls:
        target = relative_target(page, url)
        if target and target.is_file() and target.suffix not in CAPTURE_SUFFIXES:
            queue.append(target)
    if relative == 'report.html':
        assets = iter(source_manifest['embeddedAssets'])

        def extract_image(match):
            source_asset = next(assets)
            payload = base64.b64decode(match[3], validate=True)
            assert sha(payload) == source_asset['sha256']
            ext = {'webp': 'webp', 'png': 'png', 'jpeg': 'jpg'}[match[2]]
            name = 'images/' + sha(payload)[:20] + '.' + ext
            save(name, payload)
            image_proof.append({'source': source_asset['source'], 'published': name,
                                'embeddedImageBytesUnchanged': True, 'sha256': sha(payload)})
            return match[1] + name + match[4]

        text = re.sub(r'(<img\b[^>]*?\bsrc=")data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)(")',
                      extract_image, text, flags=re.I)
        assert len(image_proof) == source_manifest['images'] == 13
        assert next(assets, None) is None
        rank = re.search(r'<script id="rankdata" type="application/json">(.*?)</script>', text, re.S)
        assert rank
        rank_bytes = rank[1].encode('utf8')
        rank_compressed = exact_gzip('data/rankdata.json.gz', rank_bytes)
        save('data/rankdata.json.gz', rank_compressed)
        rank_data = json.loads(rank[1])
        assert list(rank_data) == ['new_static', 'new_pan', 'new_zoom']
        assert sum(len(v['markers']) for v in rank_data.values()) == 13031
        transforms.append({'source': 'report.html#rankdata', 'published': 'data/rankdata.json.gz',
                           'sourceBytes': len(rank_bytes), 'sourceSha256': sha(rank_bytes), 'roundTripExact': True})
        text = text[:rank.start()] + '<script id="rankdata" type="application/json"></script>' + text[rank.end():]
        scripts = list(re.finditer(r'<script>(.*?)</script>', text, re.S))
        ui = next(m for m in scripts if "getElementById('rankdata')" in m[1])
        save('report-ui.js', ui[1].encode('utf8'))
        text = text[:ui.start()] + '<script defer src="vendor/pako_inflate.min.js"></script>\n<script defer src="report-loader.js"></script>' + text[ui.end():]
        save('vendor/pako_inflate.min.js', (PUBLIC / 'ferry-stress-20261006/vendor/pako_inflate.min.js').read_bytes())
        save('report-loader.js', b"""(async function(){
try {
  const response=await fetch('data/rankdata.json.gz');
  if(!response.ok)throw new Error('Marker data HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  document.getElementById('rankdata').textContent=pako.ungzip(bytes,{to:'string'});
  const script=document.createElement('script');script.src='report-ui.js';
  script.onerror=()=>{document.getElementById('scanTable').textContent='Marker viewer failed to load; reload this page.'};
  document.body.append(script);
}catch(error){
  document.querySelectorAll('.case').forEach(e=>e.hidden=false);
  document.getElementById('scanTable').textContent='Marker data failed to load: '+error.message;
}
})();
""")
        note = ('<p class="note">正式部署版：图表、现场截图、完整调用树和源码证据均随报告发布。'
                'raw/pdata与采集目录保留在采集机，灰色原件入口不提供远端下载；完整JSON数据以gzip无损压缩下载。'
                '历史测量和结论保持不变，部署整理日期：2026-10-08。</p>')
        text = text.replace('<h1>', note + '<h1>', 1)
        text = text.replace(
            '单文件 report.html 已内嵌页面脚本、统计、图表和截图，可单独上传 Wiki。raw/pdata、完整调用树和源码为本地关联文件，无需上传；Wiki 能否直接展示 HTML 取决于平台策略。',
            '正式部署版包含页面脚本、完整统计、图表、现场截图、完整调用树和源码证据。请部署整个报告目录；raw/pdata与采集目录仅保留在采集机。')
    text = re.sub(r'<(a|img|script|link)(\s[^>]*?)>', lambda m: rewrite_link(m, page), text, flags=re.I | re.S)
    save(relative, text.encode('utf8'))

# Validate every published HTML target and fragment; script URLs include the
# dynamic runtime files added above. Raw captures are deliberately unavailable.
parsers = {}
checked = 0
tree_hashes_checked = 0
tree_marker_cache = {}
for relative in list(files):
    if not relative.endswith('.html'):
        continue
    page = DEST / relative
    parser = Links()
    parser.feed(page.read_text('utf8'))
    parsers[page.resolve()] = parser
for page, parser in parsers.items():
    for url in parser.urls:
        parts = urllib.parse.urlsplit(url)
        if parts.scheme or parts.netloc:
            assert parts.scheme != 'file', (page, url)
            continue
        target = (page.parent / urllib.parse.unquote(parts.path)).resolve() if parts.path else page
        assert target.is_relative_to(DEST.resolve()) and target.is_file(), (page, url, target, target.is_file())
        if parts.fragment:
            fragment = urllib.parse.unquote(parts.fragment)
            if target == (DEST / 'report.html').resolve() and fragment in rank_data:
                checked += 1
                continue
            if fragment not in parsers[target].ids:
                if target not in tree_marker_cache:
                    target_text = target.read_text('utf8')
                    tree = re.search(r'<script id="treedata"[^>]*>(.*?)</script>', target_text, re.S)
                    assert tree and 'decodeURIComponent(location.hash.slice(1))' in target_text, (page, url)
                    tree_marker_cache[target] = [v['marker'].lower() for v in json.loads(tree[1])['nodes']]
                assert any(fragment.lower() in marker for marker in tree_marker_cache[target]), (page, url)
                tree_hashes_checked += 1
        checked += 1

entry = {'id': ID, 'title': '名城压测性能采集分析 · 2026-09-10',
         'collectedAt': '2026-09-10 22:04–22:09', 'model': '24072PX77C',
         'version': 'Development Build 0.0.999.977', 'quality': '原报告未明确记录画质；自动简化实际状态为1',
         'href': BASE + 'report.html',
         'summary': '名城1226,175的静止、往返移动与无极缩放采集；展示PlayerLoop完整分解、持续与间歇热点、模块方案卡片、完整调用树和源码证据。每种操作只录一次，保留热机现场限制。',
         'sources': ['Unity Profiler', '渲染计数器', '温控与频率']}
catalog_path = PUBLIC / 'catalog.json'
catalog = json.loads(catalog_path.read_text('utf8'))
others = [v for v in catalog if v['id'] != ID]
write_json(catalog_path, others + [entry])
assert [v for v in json.loads(catalog_path.read_text('utf8')) if v['id'] != ID] == others
assert len({v['id'] for v in others + [entry]}) == len(others) + 1
manifest = {'id': ID, 'entry': 'report.html', 'basePath': BASE, 'preparedAt': '2026-10-08',
            'sourceReportSha256': sha(source_bytes), 'fileCount': len(files),
            'totalBytes': sum(v['bytes'] for v in files.values()), 'files': sorted(files.values(), key=lambda v: v['file'])}
write_json(DEST / 'manifest.json', manifest)
write_json(DEST / 'publication_validation.json', {
    'passed': True, 'sourceReportUnchanged': (SOURCE / 'report.html').read_bytes() == source_bytes,
    'cases': list(rank_data), 'rankRows': 13031, 'completeRankValuesAndFieldsPreserved': True,
    'all13EmbeddedImagesBytesUnchanged': image_proof, 'compressedDataRoundTrips': transforms,
    'allPublishedHtmlLinksAndAnchorsChecked': checked, 'treeMarkerSearchHashesChecked': tree_hashes_checked,
    'legacyNonMarkerTreeQueriesAdjusted': legacy_tree_queries,
    'localCaptureLinksAnnotated': local_links,
    'rawPdataZipPublished': False, 'existingCatalogEntriesUnchanged': True, 'remoteDeploymentPerformed': False})
print(json.dumps({'directory': str(DEST), 'href': entry['href'], 'files': len(files),
                  'bytes': manifest['totalBytes'], 'entryBytes': files['report.html']['bytes'],
                  'linksChecked': checked, 'catalogReports': len(others) + 1}, ensure_ascii=False), flush=True)
