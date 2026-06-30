"""perfetto_project_pack.py — 加载项目知识包供 perfetto 骨架渲染器使用。

复用 projects/<name>/ 目录下的 yaml（与 simpleperf 共用）。

加载顺序：
1. 显式 name 参数
2. PERFTOOL_PROJECT 环境变量
3. 从 perfetto summary.meta 自动检测（process name + identify.androidPackages /
   atrace slice keyword 命中 business-modules.yaml 关键字）
4. _generic 兜底
"""

import os
import re
from typing import Any

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, ".."))
PROJECTS_DIR = os.path.join(REPO_ROOT, "projects")
GENERIC_PACK_NAME = "_generic"


class ProjectPack:
    """Lazy-loaded YAML pack."""

    def __init__(self, name: str):
        self.name = name
        self.dir = os.path.join(PROJECTS_DIR, name)
        if not os.path.isdir(self.dir):
            raise ValueError(f"project pack not found: {self.dir}")
        self.pack = self._load("pack.yaml")
        self.business_modules = self._load("business-modules.yaml").get("modules", []) or []
        self.probes = self._load("probes.yaml").get("probes", []) or []
        self.slot_matchers = self._load("slot-matchers.yaml").get("matchers", []) or []

    def _load(self, fn):
        path = os.path.join(self.dir, fn)
        if not os.path.isfile(path):
            return {}
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def identify_android_packages(self) -> list[str]:
        return (self.pack.get("identify") or {}).get("androidPackages") or []

    def identify_self_developer_so(self) -> list[str]:
        return (self.pack.get("identify") or {}).get("selfDeveloperSoNames") or []

    def business_keyword_index(self) -> dict[str, str]:
        """keyword(lower) → module id"""
        out = {}
        for m in self.business_modules:
            for k in (m.get("keywords") or []):
                out[k.lower()] = m["id"]
        return out

    def hot_module_section_map(self) -> dict[str, dict]:
        """label → {section, sectionTitle, threadHint, ...} 用于骨架渲染时对热点模块加业务注解"""
        out = {}
        for m in self.business_modules:
            for k in (m.get("keywords") or []):
                out[k] = m
        return out


_PACK_CACHE: dict[str, ProjectPack] = {}


def _list_packs() -> list[str]:
    if not os.path.isdir(PROJECTS_DIR):
        return []
    return [d for d in os.listdir(PROJECTS_DIR)
            if os.path.isdir(os.path.join(PROJECTS_DIR, d)) and d != GENERIC_PACK_NAME]


def detect_project_from_summary(summary: dict[str, Any]) -> str | None:
    """从 perfetto summary 自动检测项目。
    信号：
    1. summary.meta.process / pid 字符串包含 androidPackages 子串
    2. summary 里 callTrees 节点名 / aoeHotSlices.label 含项目特化业务关键字
    """
    candidates = _list_packs()
    if not candidates:
        return None

    # 收集 summary 文本特征
    meta = summary.get("meta") or {}
    process_str = (meta.get("process") or meta.get("device") or "").lower()
    hot_labels = []
    for h in summary.get("aoeHotSlices") or []:
        if h.get("label"):
            hot_labels.append(h["label"].lower())
    for ct in summary.get("callTrees") or []:
        root = ct.get("root") or {}

        def collect(node, depth=0):
            if depth > 3 or not isinstance(node, dict):
                return
            n = node.get("name")
            if n:
                hot_labels.append(n.lower())
            for c in (node.get("children") or [])[:8]:
                collect(c, depth + 1)
        collect(root)

    text_blob = process_str + "\n" + "\n".join(hot_labels)

    # 优先 androidPackages 命中
    for cand in candidates:
        try:
            pack = ProjectPack(cand)
        except ValueError:
            continue
        for pkg in pack.identify_android_packages():
            if pkg.lower() in process_str:
                return cand
        # 业务关键字命中
        for kw in pack.business_keyword_index().keys():
            if kw and len(kw) > 5 and kw in text_blob:
                return cand

    return None


def load_project_pack(name: str | None = None, summary: dict | None = None) -> ProjectPack:
    """加载项目包；缓存 by name。"""
    if name is None:
        name = os.environ.get("PERFTOOL_PROJECT")
    if name is None and summary is not None:
        name = detect_project_from_summary(summary)
    if name is None:
        name = GENERIC_PACK_NAME

    if name in _PACK_CACHE:
        return _PACK_CACHE[name]
    try:
        pack = ProjectPack(name)
    except ValueError:
        pack = ProjectPack(GENERIC_PACK_NAME)
    _PACK_CACHE[name] = pack
    return pack


def reset_cache():
    _PACK_CACHE.clear()
