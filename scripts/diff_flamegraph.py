#!/usr/bin/env python3
"""diff_flamegraph.py - 生成 base vs opt 的差分火焰图 HTML。

思路源自 simpleperf/legacy/aoe_report_diff.py 的 A/M/D 对比，但：
  * 底层改用 simpleperf_analyzer.loader（修过 bug、参数化），而非 legacy 文件；
  * 输出真正的多层差分火焰图 HTML（不再是文本），层级与 simpleperf 自带
    report_html.py 的 Flamegraph 一致：每个线程一棵 g 调用树、root 在最底、
    子节点按耗时降序、宽度=subtree event count（cpu-clock 直接显示 ms）。

颜色：业界经典差分配色 —— 红=变慢/新增、蓝=变快/被消除、白≈不变。
宽度基准可在页面上切换：opt(默认) / base / 并集(max)；切到 base 或并集即可
看到被优化“消除”的帧（opt 中宽度为 0 的 D 帧）。

用法：
    python scripts/diff_flamegraph.py \
        --base output/maple/base_PAL-AL00_20260612_154316 \
        --opt  output/maple/opt_PAL-AL00_20260612_154649 \
        --out  output/maple/flame_demo/diff_flamegraph.html
"""

import argparse
import datetime
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, os.path.join(PROJECT_ROOT, "simpleperf"))

try:
    from simpleperf_analyzer.loader import load_profile
    from simpleperf_analyzer import config
except ImportError as e:  # pragma: no cover
    print(f"[ERROR] 无法导入 simpleperf_analyzer: {e}")
    sys.exit(1)

SCALE = config.TIME_SCALE_NS  # ns -> ms


# ---------------------------------------------------------------------------
# 输入解析
# ---------------------------------------------------------------------------
def resolve_inputs(path):
    """path 可以是采样目录（含 perf.data + binary_cache + meta.json）或 perf.data 文件。"""
    if os.path.isdir(path):
        perf = os.path.join(path, "perf.data")
        bc = os.path.join(path, "binary_cache")
        meta = os.path.join(path, "meta.json")
        if not os.path.exists(perf):
            raise FileNotFoundError(f"目录下没有 perf.data: {path}")
        return perf, (bc if os.path.isdir(bc) else None), (meta if os.path.exists(meta) else None)
    d = os.path.dirname(path)
    bc = os.path.join(d, "binary_cache")
    meta = os.path.join(d, "meta.json")
    return path, (bc if os.path.isdir(bc) else None), (meta if os.path.exists(meta) else None)


def load_meta(meta_path):
    if meta_path and os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def time_window(meta):
    s = meta.get("mono_ns_start")
    e = meta.get("mono_ns_end")
    return (int(s) if s else None), (int(e) if e else None)


# ---------------------------------------------------------------------------
# 调用树合并
# ---------------------------------------------------------------------------
def _merge_same(a, b):
    """合并同一 profile 内同名的两个调用节点（子节点的去重在 index_children 处理）。"""
    return {
        "func_name": a["func_name"],
        "event_count": a["event_count"] + b["event_count"],
        "subtree_event_count": a["subtree_event_count"] + b["subtree_event_count"],
        "child_graph": a["child_graph"] + b["child_graph"],
    }


def index_children(node):
    """把一个节点的 child_graph 按 func_name 建索引（同名合并）。"""
    idx = {}
    if not node:
        return idx
    for c in node["child_graph"]:
        n = c["func_name"]
        idx[n] = _merge_same(idx[n], c) if n in idx else c
    return idx


def merge_node(b, o, min_ms):
    """递归合并 base/opt 两棵子树，返回差分节点。任一可为 None。"""
    name = (o or b)["func_name"]
    out = {
        "n": name,
        "b": round((b["subtree_event_count"] if b else 0) / SCALE, 3),   # base subtree ms
        "o": round((o["subtree_event_count"] if o else 0) / SCALE, 3),   # opt  subtree ms
        "bs": round((b["event_count"] if b else 0) / SCALE, 3),          # base self ms
        "os": round((o["event_count"] if o else 0) / SCALE, 3),          # opt  self ms
        "c": [],
    }
    b_idx = index_children(b)
    o_idx = index_children(o)
    names = list(b_idx.keys()) + [n for n in o_idx if n not in b_idx]
    for n in names:
        child = merge_node(b_idx.get(n), o_idx.get(n), min_ms)
        if max(child["b"], child["o"]) < min_ms:
            continue
        out["c"].append(child)
    # 子节点按 max(base,opt) 降序，贴近 simpleperf 的展示
    out["c"].sort(key=lambda x: max(x["b"], x["o"]), reverse=True)
    return out


def build_thread_trees(profile):
    """返回 {thread_name: call_graph_root}。aggregate_by_thread_name 已合并 tid。"""
    trees = {}
    for _pname, thread in profile.iter_threads():
        tname = thread["thread_name"]
        cg = thread["call_graph"]
        if tname in trees:
            # 同名跨进程：保留 subtree 更大的
            if cg["subtree_event_count"] > trees[tname]["subtree_event_count"]:
                trees[tname] = cg
        else:
            trees[tname] = cg
    return trees


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def build_payload(base_profile, opt_profile, min_node_ms, min_thread_ms):
    base_trees = build_thread_trees(base_profile)
    opt_trees = build_thread_trees(opt_profile)

    all_names = list(base_trees.keys()) + [n for n in opt_trees if n not in base_trees]
    threads = []
    for name in all_names:
        b = base_trees.get(name)
        o = opt_trees.get(name)
        b_ms = round((b["subtree_event_count"] if b else 0) / SCALE, 3)
        o_ms = round((o["subtree_event_count"] if o else 0) / SCALE, 3)
        if max(b_ms, o_ms) < min_thread_ms:
            continue
        merged = merge_node(b, o, min_node_ms)
        merged["n"] = name  # 根节点用线程名
        threads.append({
            "name": name,
            "base_ms": b_ms,
            "opt_ms": o_ms,
            "delta_ms": round(o_ms - b_ms, 3),
            "tree": merged,
        })
    threads.sort(key=lambda t: max(t["base_ms"], t["opt_ms"]), reverse=True)
    return threads


def main():
    ap = argparse.ArgumentParser(description="生成 base vs opt 差分火焰图 HTML")
    ap.add_argument("--base", required=True, help="base 采样目录或 perf.data")
    ap.add_argument("--opt", required=True, help="opt 采样目录或 perf.data")
    ap.add_argument("--out", default=None, help="输出 HTML 路径")
    ap.add_argument("--min-node-ms", type=float, default=0.5,
                    help="低于该 max(base,opt) 耗时(ms)的节点不进入火焰图，控制体积")
    ap.add_argument("--min-thread-ms", type=float, default=5.0,
                    help="低于该耗时(ms)的线程整体不展示")
    ap.add_argument("--min-callchain-percent", type=float, default=0.1,
                    help="传给 load_profile 的调用链裁剪阈值(%)，越大 HTML 越小")
    ap.add_argument("--time-window", action="store_true",
                    help="按 meta.json 的 mono_ns 窗口裁剪采样（默认关闭；因 base/opt 窗口常不对称会"
                         "导致时长不可比，默认用整段采样）")
    args = ap.parse_args()

    sys.setrecursionlimit(config.MAX_CALLSTACK_LENGTH * 2 + 50)

    base_perf, base_bc, base_meta_path = resolve_inputs(args.base)
    opt_perf, opt_bc, opt_meta_path = resolve_inputs(args.opt)
    base_meta = load_meta(base_meta_path)
    opt_meta = load_meta(opt_meta_path)

    bs, be = time_window(base_meta) if args.time_window else (None, None)
    os_, oe = time_window(opt_meta) if args.time_window else (None, None)

    print(f"[INFO] 加载 base: {base_perf}  (binary_cache={'有' if base_bc else '无'})")
    base_profile = load_profile(
        base_perf, binary_cache=base_bc, label=base_meta.get("label", "base"),
        aggregate_by_thread_name=True, min_callchain_percent=args.min_callchain_percent,
        time_start_ns=bs, time_end_ns=be,
    )
    print(f"[INFO] 加载 opt : {opt_perf}  (binary_cache={'有' if opt_bc else '无'})")
    opt_profile = load_profile(
        opt_perf, binary_cache=opt_bc, label=opt_meta.get("label", "opt"),
        aggregate_by_thread_name=True, min_callchain_percent=args.min_callchain_percent,
        time_start_ns=os_, time_end_ns=oe,
    )

    print("[INFO] 合并调用树 ...")
    threads = build_payload(base_profile, opt_profile, args.min_node_ms, args.min_thread_ms)
    print(f"[INFO] 共 {len(threads)} 个线程进入火焰图: "
          + ", ".join(t['name'] for t in threads[:8]) + (" ..." if len(threads) > 8 else ""))

    event = next((s["eventName"] for s in base_profile.record_info["sampleInfo"]
                  if s["eventName"] in config.CPU_EVENT_NAMES), "?")

    payload = {
        "meta": {
            "base_label": base_meta.get("label", "base"),
            "opt_label": opt_meta.get("label", "opt"),
            "base_dir": os.path.basename(args.base.rstrip("/\\")),
            "opt_dir": os.path.basename(args.opt.rstrip("/\\")),
            "device": base_meta.get("device", "?"),
            "scene": base_meta.get("scene", "?"),
            "event": event,
            "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
        "threads": threads,
    }

    out_path = args.out or os.path.join(os.path.dirname(base_perf), "diff_flamegraph.html")
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    html_text = render_html(payload)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_text)
    print(f"[OK] 差分火焰图已生成: {os.path.abspath(out_path)}")


# ---------------------------------------------------------------------------
# HTML 渲染（自包含，无网络依赖）
# ---------------------------------------------------------------------------
def render_html(payload):
    data_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return _HTML_TEMPLATE.replace("/*__DATA__*/", data_json)


_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>差分火焰图 · base vs opt</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0f1115; color:#e6e6e6;
    font-family:-apple-system,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif; }
  header { padding:14px 20px; border-bottom:1px solid #232733; background:#141821; }
  header h1 { margin:0 0 4px; font-size:17px; }
  header .sub { color:#8a94a6; font-size:12.5px; line-height:1.7; }
  header .sub b.red{color:#ff7b82;} header .sub b.blue{color:#6cb3ff;}
  .toolbar { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:10px 20px; background:#11141b; border-bottom:1px solid #232733; }
  .toolbar label { font-size:12px; color:#8a94a6; }
  .toolbar select, .toolbar input[type=text] {
    background:#1c2230; border:1px solid #2c3344; color:#e6e6e6;
    padding:6px 10px; border-radius:6px; outline:none; }
  .toolbar input[type=text]{ width:220px; }
  .btn { background:#2a3142; border:1px solid #38415a; color:#cdd6e6;
    padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px; }
  .btn:hover{ background:#353d52; }
  .legend { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:12px; color:#aab3c5; }
  .grad { width:140px; height:12px; border-radius:3px; vertical-align:middle;
    background:linear-gradient(90deg,#1f77b4,#9ec9e4,#eeeeee,#eaa3a6,#d62728); }
  #crumb { padding:8px 20px; font-size:12px; color:#8a94a6; min-height:18px; }
  #crumb span{ color:#6cb3ff; cursor:pointer; } #crumb span:hover{ text-decoration:underline; }
  #wrap { padding:4px 20px 50px; }
  #chart { position:relative; width:100%; }
  .frame { position:absolute; font-size:11px; padding:0 5px; overflow:hidden; white-space:nowrap;
    border-radius:2px; cursor:pointer; border:1px solid rgba(0,0,0,.22); }
  .frame:hover{ filter:brightness(1.12); outline:1px solid #fff; }
  .frame.dim{ opacity:.25; }
  #tip { position:fixed; pointer-events:none; z-index:10; display:none; background:#0b0d12;
    border:1px solid #38415a; border-radius:8px; padding:9px 12px; font-size:12px; max-width:420px;
    box-shadow:0 8px 24px rgba(0,0,0,.5); }
  #tip .fn{ color:#fff; font-weight:600; margin-bottom:6px; word-break:break-all; }
  #tip .r{ display:flex; justify-content:space-between; gap:18px; color:#c2cad8; }
  #tip .up{color:#ff7b82;} #tip .down{color:#6cb3ff;} #tip .flat{color:#c2cad8;}
</style>
</head>
<body>
<header>
  <h1>差分火焰图 · <span id="h-base"></span> → <span id="h-opt"></span></h1>
  <div class="sub" id="meta-line"></div>
  <div class="sub">宽度 = subtree 耗时(ms)；颜色 = opt 相对 base：<b class="red">红=变慢/新增</b>、<b class="blue">蓝=变快/被消除</b>、白≈不变。
    层级与 simpleperf 火焰图一致（root 线程在最底、被调用者向上、子节点降序）。点击下钻，双击空白重置。</div>
</header>

<div class="toolbar">
  <label>线程</label>
  <select id="thread"></select>
  <label>宽度基准</label>
  <select id="basis">
    <option value="opt">opt（经典）</option>
    <option value="base">base</option>
    <option value="union">并集 max（显示被消除帧）</option>
  </select>
  <button class="btn" id="reset">↺ 重置缩放</button>
  <input type="text" id="search" placeholder="搜索函数名高亮…">
  <div class="legend"><b style="color:#6cb3ff">蓝 = opt 变快</b><span class="grad"></span><b style="color:#ff7b82">红 = opt 变慢</b></div>
</div>

<div id="crumb"></div>
<div id="wrap"><div id="chart"></div></div>
<div id="tip"></div>

<script>
const PAYLOAD = /*__DATA__*/;
const M = PAYLOAD.meta;
document.getElementById("h-base").textContent = M.base_label + " (" + M.base_dir + ")";
document.getElementById("h-opt").textContent  = M.opt_label  + " (" + M.opt_dir  + ")";
document.getElementById("meta-line").textContent =
  `设备 ${M.device} · 场景 ${M.scene} · 事件 ${M.event} · 生成 ${M.generated}`;

const chart = document.getElementById("chart");
const tip = document.getElementById("tip");
const ROW = 22;
let curThread = null, basis = "opt", crumb = [];

// ---- 工具 ----
function val(n){ return basis==="base" ? n.b : basis==="opt" ? n.o : Math.max(n.b,n.o); }
function computeAug(n){ let c=0; (n.c||[]).forEach(ch=>c+=computeAug(ch)); n._v=Math.max(val(n),c); return n._v; }
function lerp(a,b,t){return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;}
function diffRatio(n){ const d=n.o-n.b, den=n.b>0?n.b:(n.o>0?n.o:1); return Math.max(-1,Math.min(1,d/den)); }
function colr(n){ const r=diffRatio(n);
  if(Math.abs(r)<0.02) return "#ededed";
  return r>0 ? lerp([238,238,238],[214,39,40],Math.min(1,r))   // 红=慢
             : lerp([238,238,238],[31,119,180],Math.min(1,-r));} // 蓝=快
function textColor(n){ return Math.abs(diffRatio(n))>0.45 ? "#fff" : "#1a1a1a"; }

// ---- 渲染 ----
function render(){
  const root = crumb[crumb.length-1];
  computeAug(root);
  chart.innerHTML = "";
  const W = chart.clientWidth;
  const rootVal = val(root) || 1;
  const frames = []; let maxD = 0;
  (function lay(n,depth,x,w){ maxD=Math.max(maxD,depth); frames.push({n,depth,x,w});
    let cx=x; (n.c||[]).forEach(ch=>{ const cw=w*(ch._v/n._v); lay(ch,depth+1,cx,cw); cx+=cw; }); })(root,0,0,W);
  chart.style.height = (maxD+1)*ROW + 6 + "px";
  const q = (document.getElementById("search").value||"").toLowerCase();
  for(const f of frames){
    if(f.w < 0.4) continue;
    const d = document.createElement("div");
    d.className = "frame";
    d.style.left = f.x+"px";
    d.style.top = (maxD - f.depth)*ROW + "px";   // root 在最底（bottom-up）
    d.style.height = (ROW-2)+"px"; d.style.lineHeight=(ROW-2)+"px";
    d.style.width = Math.max(f.w-1,1)+"px";
    d.style.background = colr(f.n);
    d.style.color = textColor(f.n);
    if(f.w > 36){
      const pct = (val(f.n)/rootVal*100);
      d.textContent = `${f.n.n}  (${val(f.n).toFixed(1)}ms ${pct.toFixed(1)}%)`;
    }
    if(q){ if(f.n.n.toLowerCase().includes(q)) d.style.outline="2px solid #ffd400"; else d.classList.add("dim"); }
    d.addEventListener("click", e=>{ e.stopPropagation(); zoom(f.n); });
    d.addEventListener("mousemove", e=>showTip(e,f.n,rootVal));
    d.addEventListener("mouseleave", ()=>tip.style.display="none");
    chart.appendChild(d);
  }
}

function showTip(e,n,rootVal){
  const d = n.o - n.b, pct = n.b>0 ? d/n.b*100 : (n.o>0?100:0);
  const share = (val(n)/rootVal*100);
  let tag="持平", cls="flat";
  if(n.b===0){tag="新增 (A)";cls="up";} else if(n.o===0){tag="消除 (D)";cls="down";}
  else if(d>0.3){tag="变慢 (M)";cls="up";} else if(d<-0.3){tag="变快 (M)";cls="down";}
  tip.innerHTML =
    `<div class="fn">${n.n}</div>`+
    `<div class="r"><span>base subtree</span><b>${n.b.toFixed(1)} ms</b></div>`+
    `<div class="r"><span>opt  subtree</span><b>${n.o.toFixed(1)} ms</b></div>`+
    `<div class="r"><span>Δ subtree</span><b class="${cls}">${d>=0?"+":""}${d.toFixed(1)} ms (${pct>=0?"+":""}${pct.toFixed(1)}%)</b></div>`+
    `<div class="r"><span>self (base/opt)</span><b>${n.bs.toFixed(1)} / ${n.os.toFixed(1)} ms</b></div>`+
    `<div class="r"><span>占当前根</span><b>${share.toFixed(1)}%</b></div>`+
    `<div class="r"><span>状态</span><b class="${cls}">${tag}</b></div>`;
  tip.style.display="block";
  let x=e.clientX+14; if(x+420>innerWidth) x=e.clientX-420;
  let y=e.clientY+14; if(y+160>innerHeight) y=e.clientY-160;
  tip.style.left=x+"px"; tip.style.top=y+"px";
}

function zoom(n){ const i=crumb.indexOf(n); crumb = i>=0 ? crumb.slice(0,i+1) : crumb.concat(n); render(); drawCrumb(); }
function drawCrumb(){
  const bc=document.getElementById("crumb");
  bc.innerHTML = crumb.map((n,i)=>`<span data-i="${i}">${n.n}</span>`).join(' <b style="color:#4a5161">/</b> ');
  bc.querySelectorAll("span").forEach(s=> s.onclick=()=>{ crumb=crumb.slice(0,+s.dataset.i+1); render(); drawCrumb(); });
}

function loadThread(name){
  const t = PAYLOAD.threads.find(x=>x.name===name);
  curThread = t; crumb = [t.tree]; render(); drawCrumb();
}

// ---- 初始化 ----
const sel = document.getElementById("thread");
PAYLOAD.threads.forEach(t=>{
  const o=document.createElement("option"); o.value=t.name;
  const sign = t.delta_ms>0?"+":"";
  o.textContent = `${t.name}  (base ${t.base_ms.toFixed(0)} / opt ${t.opt_ms.toFixed(0)} ms · Δ${sign}${t.delta_ms.toFixed(0)})`;
  sel.appendChild(o);
});
sel.onchange = ()=>loadThread(sel.value);
document.getElementById("basis").onchange = e=>{ basis=e.target.value; render(); };
document.getElementById("reset").onclick = ()=>{ crumb=[curThread.tree]; render(); drawCrumb(); };
document.getElementById("search").oninput = render;
document.addEventListener("dblclick", ()=>{ crumb=[curThread.tree]; render(); drawCrumb(); });
window.addEventListener("resize", render);

if(PAYLOAD.threads.length){ loadThread(PAYLOAD.threads[0].name); }
else { chart.innerHTML='<div style="padding:40px;color:#8a94a6">没有线程数据</div>'; }
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
