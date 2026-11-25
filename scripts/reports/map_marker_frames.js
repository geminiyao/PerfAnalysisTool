// One row per original display frame for one thread and complete marker path.
const markerSeriesCache = new Map();

function markerIndexHash(k, query, sort, page, pid) {
  const params = new URLSearchParams({k});
  if (query) params.set('q', query);
  if (sort && sort !== '2') params.set('sort', sort);
  if (page > 0) params.set('page', page + 1);
  if (pid != null) params.set('i', pid);
  return '#' + (pid == null ? 'index' : 'marker-frames') + '?' + params;
}

function markerFrameLink(k, pid, count) {
  const url = markerIndexHash(k, by('idxq').value, by('idxsort').value, indexPage, pid);
  return '<a href="' + safe(url) + '">全部 ' + count + ' 帧</a>';
}

function syncMarkerIndex(k) {
  const query = by('idxq').value, sort = by('idxsort').value;
  for (const a of document.querySelectorAll('[data-pane=index] .samplebar a')) {
    const sample = new URLSearchParams(a.hash.split('?')[1]).get('k');
    a.href = markerIndexHash(sample, query, sort, 0);
  }
  history.replaceState(history.state, '', markerIndexHash(k, query, sort, indexPage));
}

async function markerSeries(k, pid, ticket) {
  const key = k + '/' + pid;
  if (markerSeriesCache.has(key)) return markerSeriesCache.get(key);
  const rows = [], frames = P[k].frames, packed = M[k].rows;
  for (let start = 0; start < frames.length; start += 12) {
    if (ticket !== epoch) return;
    const group = await Promise.all(packed.slice(start, start + 12).map((data, j) => {
      // Reuse an already expanded frame, otherwise release the buffer after this batch.
      return buffers.get(k + '/' + (start + j)) || unpack(data).then(b => new DataView(b));
    }));
    for (const [j, buf] of group.entries()) {
      for (let pos = 0; pos < buf.byteLength; pos += 20) {
        if (buf.getUint32(pos, true) !== pid) continue;
        const calls = buf.getUint32(pos + 16, true);
        if (calls) {
          const [f, cpu] = frames[start + j];
          rows.push({f, cpu, calls, total:buf.getFloat32(pos + 4, true),
            self:buf.getFloat32(pos + 8, true), peak:buf.getFloat32(pos + 12, true)});
        }
        break;
      }
    }
  }
  if (ticket !== epoch) return;
  if (markerSeriesCache.size >= 16) markerSeriesCache.delete(markerSeriesCache.keys().next().value);
  markerSeriesCache.set(key, rows);
  return rows;
}

async function showMarkerFrames(k, q, ticket) {
  const host = by('marker-frame-results');
  host.textContent = '正在读取该路径的全部出现帧…';
  const m = await ensure(k);
  if (ticket !== epoch) return;
  const pid = /^\d+$/.test(q.get('i') || '') ? Number(q.get('i')) : -1;
  const query = q.get('q') ?? (m.paths[pid] ? name(m,pid) : '');
  const back = markerIndexHash(k, query, q.get('sort'), (Number(q.get('page')) || 1) - 1);
  const backLink = '<p><a href="' + safe(back) + '">‹ 返回 Marker 搜索结果</a></p>';
  if (!m.paths[pid] || !m.idx[pid][0]) {
    host.innerHTML = backLink + '<p>该采样没有这条调用路径。</p>';
    return;
  }
  const rows = await markerSeries(k, pid, ticket);
  if (ticket !== epoch) return;
  const marker = name(m, pid), th = thread(m, pid);
  const frameUrl = (page, f) => address(page, k, f, marker, th, pid);
  const calls = rows.reduce((s,r) => s + r.calls, 0);
  const total = rows.reduce((s,r) => s + r.total, 0);
  const heavy = rows.filter(r => r.total >= 1).length;
  const timed = new Map(rows.map(r => [r.f, r.total]));
  if (calls !== m.idx[pid][0] || rows.length !== m.idx[pid][3]) {
    throw new Error('逐帧记录与 Marker 索引的调用数或出现帧数不一致');
  }
  host.innerHTML = backLink + '<h2>' + safe(marker) + '</h2><p>' + safe(k + ' · ' + P[k].label + '　' + th) +
    '</p><details><summary>完整调用路径</summary><p>' + safe(path(m, pid)) + '</p></details>' +
    table(['全部出现帧','调用次数','累计 Total ms','平均 ms/次','平均 ms/出现帧'],
      [[rows.length,calls,total.toFixed(3),(total/calls).toFixed(3),(total/rows.length).toFixed(3)]]) +
    '<h3>逐帧 Total 耗时</h3><p>同帧多次调用先求和。曲线覆盖整份采样，点有调用的帧可打开 Timeline。</p>' +
    '<div class="panel pad" id="marker-frame-plot"></div><h3>出现帧明细</h3><div class="filters">' +
    '<label>显示 <select id="marker-frame-filter"><option value="all">全部 ' + rows.length + ' 帧</option>' +
    '<option value="heavy">帧内 Total ≥1 ms（' + heavy + ' 帧）</option></select></label>' +
    '<label>排序 <select id="marker-frame-sort"><option value="frame">帧号</option>' +
    '<option value="total">帧内 Total 从高到低</option><option value="peak">单次峰值从高到低</option></select></label>' +
    '</div><div id="marker-frame-table"></div>';
  plot(by('marker-frame-plot'), k, P[k].frames.map(([f]) => timed.get(f) || 0), false, 0, marker, 'ms',
    f => { if (timed.has(f)) location.hash = frameUrl('timeline', f); });

  function remember(page) {
    const sort = by('marker-frame-sort').value;
    if (sort === 'frame') q.delete('by'); else q.set('by',sort);
    if (by('marker-frame-filter').value === 'heavy') q.set('min','1'); else q.delete('min');
    if (page > 0) q.set('fp',page + 1); else q.delete('fp');
    history.replaceState(history.state,'','#marker-frames?' + q);
  }
  function draw(page) {
    const onlyHeavy = by('marker-frame-filter').value === 'heavy';
    const sort = by('marker-frame-sort').value;
    const visible = onlyHeavy ? rows.filter(r => r.total >= 1) : rows.slice();
    if (sort !== 'frame') visible.sort((a,b) => b[sort] - a[sort] || a.f - b.f);
    impactPages(by('marker-frame-table'), visible,
      ['显示帧','整帧 CPU ms','调用次数','帧内 Total ms','帧内 Self ms','平均 ms/次','单次峰值 ms','原始证据'],
      r => ['F' + r.f,r.cpu.toFixed(2),r.calls,r.total.toFixed(3),r.self.toFixed(3),
        (r.total/r.calls).toFixed(3),r.peak.toFixed(3),
        '<a href="' + safe(frameUrl('timeline',r.f)) + '">Timeline</a> · <a href="' + safe(frameUrl('tree',r.f)) + '">调用树</a>'],page,remember);
  }
  by('marker-frame-filter').value = q.get('min') === '1' ? 'heavy' : 'all';
  by('marker-frame-sort').value = ['total','peak'].includes(q.get('by')) ? q.get('by') : 'frame';
  by('marker-frame-filter').onchange = by('marker-frame-sort').onchange = () => { remember(0); draw(0); };
  draw(/^[1-9]\d*$/.test(q.get('fp') || '') ? Number(q.get('fp')) - 1 : 0);
}
