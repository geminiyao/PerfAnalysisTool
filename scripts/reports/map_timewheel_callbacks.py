"""Build the TimeWheel callback view from the published map CPU report and capture chunks."""
import argparse
import base64
from collections import defaultdict
import gzip
from hashlib import sha256
from html import escape
import json
from pathlib import Path
import re
import struct


DISPATCH = 'LUA:TimeWheelScheduler.InvokeHandler'
EXCLUDE = {'GC.Collect', 'GarbageCollector.CollectIncremental',
           'WaitForTargetFPS', 'Gfx.WaitForPresentOnGfxThread', 'URP.WaitForPresent'}
FRAME_ROW = struct.Struct('<IfffI')
MS = 1_000_000  # Store integer nanoseconds in the reader payload.


def scan(model, frames):
    paths = model['paths']
    names = [model['names'][idx] for _, _, idx in paths]
    entries = {i for i, (th, p, _) in enumerate(paths)
               if p >= 0 and names[p] == DISPATCH and model['threads'][th].endswith(':Main Thread')}
    children = defaultdict(list)
    for i, (_, parent, _) in enumerate(paths):
        if parent in entries and names[i] not in EXCLUDE:
            children[parent].append(i)
    tracked = entries.union(*(children[p] for p in entries))
    excluded_for = {}
    for i, name in enumerate(names):
        if name not in EXCLUDE:
            continue
        p = paths[i][1]
        owners = []
        while p >= 0 and names[p] not in EXCLUDE:
            if p in tracked:
                owners.append(p)
            p = paths[p][1]
        if owners:
            excluded_for[i] = owners
    records = defaultdict(list)
    for frame, packed in zip(frames, model['rows'], strict=True):
        hits, removed = {}, defaultdict(float)
        buf = gzip.decompress(base64.b64decode(packed))
        for i, total, own, _, calls in FRAME_ROW.iter_unpack(buf):
            if i in tracked and calls:
                hits[i] = (calls, total, own)
            if i in excluded_for:
                for p in excluded_for[i]:
                    removed[p] += total
        for i, (calls, total, own) in hits.items():
            deduction = total if names[i] in EXCLUDE else min(total, removed[i])
            records[i].append([frame[0], calls, round(total*MS), round(own*MS), round(deduction*MS)])

    def node(i):
        rows = records[i]
        net = [r[2]-r[4] for r in rows]
        return dict(id=i, name=names[i], rows=rows, net=sum(net), heavy=sum(v >= MS for v in net))

    result = []
    for entry in sorted(entries):
        if not records[entry]:
            continue
        parent = node(entry)
        parts = [node(i) for i in children[entry] if records[i]]
        child = max(parts, key=lambda n: n['net'], default=None)
        # Anonymous Lua wrappers can hide the actual operation. Expose the child
        # separately so each displayed figure still belongs to exactly one path.
        focus = parent
        if (child and parent['net'] and child['net'] >= .8*parent['net']
                and (parent['heavy'] < 3 or child['heavy'] >= 3)):
            focus = child
        chain = []
        p = entry
        while p >= 0:
            chain.append(names[p])
            p = paths[p][1]
        result.append(dict(entry=parent, child=child, focus=focus['id'], path=chain[::-1]))
    return result


def focus_node(record):
    return record['entry'] if record['entry']['id'] == record['focus'] else record['child']


def home(data):
    grouped = defaultdict(list)
    for k, records in data.items():
        for record in records:
            n = focus_node(record)
            if n['heavy'] >= 3:
                grouped[n['name']].append((k, n))
    lines = []
    for name, hits in sorted(grouped.items(), key=lambda item: -max(n['heavy'] for _, n in item[1]))[:3]:
        links = '　'.join(f'<a href="#callbacks?k={k}&amp;i={n["id"]}">{k} · {n["heavy"]} 帧</a>' for k, n in hits)
        top = max(r[2]-r[4] for _, n in hits for r in n['rows']) / MS
        lines.append(f'<tr><td>{escape(name)}</td><td>{links}</td><td>{top:.3f}</td></tr>')
    body = ('<div class="scroll panel"><table><thead><tr><th>回调或主要子调用</th><th>达到 1 ms 的帧数 · 点击看该采样全部出现帧</th>'
            '<th>所列采样最高 ms/帧</th></tr></thead><tbody>'+''.join(lines)+'</tbody></table></div>') if lines else '<p>本组采样中没有达到该门槛的回调。</p>'
    return ('<h2>反复耗时的定时回调</h2><p>逐帧检查主线程 TimeWheel 回调，计入子调用并扣除其中的 GC 和帧率等待。'
            '同一采样至少 3 帧达到 1 ms 即入选。按单份采样达到门槛的帧数列出前三项。</p>'+body+
            '<p><a href="#callbacks?k='+next(iter(data))+'">查看各采样的定时回调与全部出现帧 ›</a></p>')


def enrich(html, data):
    nav = '<a class="sideitem" href="#callbacks" data-nav="callbacks"><span aria-hidden="true">·</span>定时回调热点</a>'
    panel = ('<section class="view" data-pane="callbacks" hidden><h1>定时回调热点</h1><div class="samplebar"></div>'
             '<p>范围为主线程 LUA:TimeWheelScheduler.InvokeHandler 的直接调用。净耗时为 Total 扣除该路径内的 GC 回收和帧率等待，同帧多次调用先求和。'
             '若一个直接子调用占入口累计净耗时至少 80%，优先列出该子调用。入口达到重复门槛时，子调用也须达到该门槛。</p>'
             '<div id="callback-results"></div></section>')
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', r'\u003c')
    script = Path(__file__).with_suffix('.js').read_text('utf8')
    fragments = [
        ('nav', '<a class="sideitem" href="#path-rank"', nav),
        ('home', '<h2>哪些模块值得关注</h2>', home(data)),
        ('panel', '<section class="view" data-pane="impact"', panel),
        ('reader', '</body>', '<script type="application/json" id="callback-records">'+payload+'</script><script>'+script+'</script>'),
    ]
    for key, anchor, body in fragments:
        start, end = '<!--timewheel-'+key+'-->', '<!--/timewheel-'+key+'-->'
        if start in html:
            a, _, rest = html.partition(start)
            _, sep, b = rest.partition(end)
            if not sep:
                raise ValueError('Incomplete callback section '+key)
            html = a+b
        if html.count(anchor) != 1:
            raise ValueError('Unexpected report structure at '+key)
        html = html.replace(anchor, start+body+end+anchor, 1)
    return html


def build(directory):
    report = directory/'report.html'
    html = report.read_text('utf8')
    marker = '<script>const P='
    captures, _ = json.JSONDecoder().raw_decode(html, html.index(marker)+len(marker))
    data = {}
    for k, capture in captures.items():
        text = (directory/f'capture-{k}.js').read_bytes()
        match = re.fullmatch(rb"payloads\['([A-Z])'\]='([A-Za-z0-9+/=]+)';", text)
        if not match or match[1].decode() != k:
            raise ValueError(f'Invalid capture chunk {k}')
        model = json.loads(gzip.decompress(base64.b64decode(match[2])))
        data[k] = scan(model, capture['frames'])
    content = enrich(html, data).encode()
    manifest = directory/'manifest.json'
    original = manifest.read_bytes()
    info = json.loads(original)
    entry, = [r for r in info['files'] if r['file'] == report.name]
    entry.update(bytes=len(content), sha256=sha256(content).hexdigest())
    info['totalBytes'] = sum(r['bytes'] for r in info['files'])
    metadata = json.dumps(info, ensure_ascii=False, indent=2) + ('\n' if original.endswith(b'\n') else '')
    if b'\r\n' in original:
        metadata = metadata.replace('\n', '\r\n')
    for target, result in [(report, content), (manifest, metadata.encode())]:
        temp = target.with_name(target.name+'.timewheel-tmp')
        temp.write_bytes(result)
        temp.replace(target)
    for k, records in data.items():
        hot = sorted((focus_node(r) for r in records if focus_node(r)['heavy'] >= 3), key=lambda n: -n['heavy'])
        print(k, len(records), [(n['name'], n['heavy']) for n in hot])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report_directory', type=Path)
    build(parser.parse_args().report_directory)
