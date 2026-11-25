(() => {
  let captures;
  const unit = 1e6;
  const ms = value => (value / unit).toFixed(3);
  const net = row => row[2] - row[4];
  const focus = r => r.focus === r.entry.id ? r.entry : r.child;
  const url = (k, id, all) => '#callbacks?k=' + k + (id == null ? '' : '&i=' + id) + (all ? '&all=1' : '');
  const anchor = (href, label) => '<a href="' + safe(href) + '">' + safe(label) + '</a>';
  const frameLink = (k, node, row, page) => address(page, k, row[0], node.name, '', node.id);

  function showList(host, k, records, all) {
    const visible = records.filter(r => all || focus(r).heavy >= 3)
      .sort((a, b) => focus(b).heavy - focus(a).heavy || focus(b).net - focus(a).net || a.entry.id - b.entry.id);
    const mode = '<div class="chips">' +
      [false, true].map(value => '<a class="chip ' + (all === value ? 'selected' : '') + '" href="' +
        safe(url(k, null, value)) + '">' + (value ? '全部入口（' + records.length + '）' : '至少 3 帧达到 1 ms') + '</a>').join('') + '</div>';
    host.innerHTML = mode + (visible.length ? table(
      ['回调或主要子调用', '达到 1 ms 的帧数', '全部出现帧', '调用次数', '净耗时 ms/次', '净耗时 ms/出现帧', '累计净耗时 ms'],
      visible.map(r => {
        const n = focus(r), calls = n.rows.reduce((s, row) => s + row[1], 0);
        const ref = url(k, n.id, all);
        const parent = n.id === r.entry.id ? r.path.at(-3) + ' → ' + r.path.at(-2) : '回调入口 · ' + r.entry.name;
        return [anchor(ref, n.name) + '<small class="sub">' + safe(parent) + '</small>', n.heavy,
          anchor(ref, n.rows.length + ' 帧 ›'), calls, ms(n.net / calls), ms(n.net / n.rows.length), ms(n.net)];
      })) : '<p>该采样没有回调在至少 3 帧达到 1 ms。可切换到「全部入口」查看低频调用。</p>');
  }

  function showDetail(host, k, record, node, all) {
    const rows = node.rows, frames = P[k].frames;
    const stats = new Map(frames.map(([f, cpu], i) => [f, {cpu, flag: P[k].impact.flags[i]}]));
    const calls = rows.reduce((s, r) => s + r[1], 0);
    const total = rows.reduce((s, r) => s + r[2], 0);
    const self = rows.reduce((s, r) => s + r[3], 0);
    const source = record.path.concat(node === record.entry ? [] : [node.name]);
    const alternate = node === record.entry ? record.child : record.entry;
    const relation = node === record.entry ? '累计净耗时最高的直接子调用' : '查看回调入口';
    const altLink = alternate ? '<p>' + relation + '　' + anchor(url(k, alternate.id, all), alternate.name) + '</p>' : '';
    const clean = rows.filter(row => {
      const [gcCalls, waitMs] = stats.get(row[0]).flag;
      return net(row) >= unit && gcCalls === 0 && waitMs < 1;
    }).sort((a, b) => net(a) - net(b) || a[0] - b[0]);
    const typical = clean[Math.floor((clean.length - 1)/2)];
    const example = typical ? '<p>典型帧　' + anchor(frameLink(k, node, typical, 'timeline'), k + ' F' + typical[0]) +
      ' · 净耗时 ' + ms(net(typical)) + ' ms。取达到 1 ms、整帧无 GC 回收且帧率等待少于 1 ms 的帧，按净耗时取中间一帧。</p>' : '';
    host.innerHTML = '<p>' + anchor(url(k, null, all), '‹ 本采样回调列表') + '</p><h2>' + safe(node.name) + '</h2>' +
      table(['调用次数', '出现帧', '达到 1 ms 的帧数', '累计 Total ms', '累计 Self ms', '净耗时 ms/次', '净耗时 ms/出现帧'],
        [[calls, rows.length, node.heavy, ms(total), ms(self), ms(node.net/calls), ms(node.net/rows.length)]]) +
      '<details><summary>完整调用路径</summary><p>' + safe(source.join(' → ')) + '</p></details>' + altLink + example +
      '<h3>全部出现帧</h3><div class="filters"><label>排序 <select id="callback-order"><option value="frame">帧号</option>' +
      '<option value="cost">净耗时从高到低</option></select></label></div><div id="callback-frames"></div>';
    const order = host.querySelector('#callback-order');
    function draw() {
      const sorted = order.value === 'cost' ? [...rows].sort((a,b) => net(b)-net(a) || a[0]-b[0]) : rows;
      impactPages(host.querySelector('#callback-frames'), sorted,
        ['显示帧', '整帧 CPU ms', '调用次数', 'Total ms（含子调用）', 'Self ms', '子树内 GC 与等待 ms', '净耗时 ms', '原始证据'],
        row => ['F' + row[0], stats.get(row[0]).cpu.toFixed(2), row[1], ms(row[2]), ms(row[3]), ms(row[4]), ms(net(row)),
          anchor(frameLink(k, node, row, 'timeline'), 'Timeline') + ' · ' + anchor(frameLink(k, node, row, 'tree'), '调用树')]);
    }
    order.onchange = draw;
    draw();
  }

  function render() {
    const [page, query] = location.hash.slice(1).split('?');
    if (page !== 'callbacks') return;
    captures ??= JSON.parse(document.getElementById('callback-records').textContent);
    const params = new URLSearchParams(query);
    const k = Object.hasOwn(captures, params.get('k')) ? params.get('k') : active;
    const all = params.get('all') === '1';
    const host = document.getElementById('callback-results'), records = captures[k];
    const id = params.has('i') ? Number(params.get('i')) : null;
    const record = records.find(r => r.entry.id === id || r.child?.id === id);
    if (record) {
      showDetail(host, k, record, record.entry.id === id ? record.entry : record.child, all);
    } else {
      showList(host, k, records, all);
    }
  }
  window.addEventListener('hashchange', render);
  render();
})();
