"""ProjectPack — 加载项目知识包 (projects/<name>/*.yaml)。

启动流程：
1. 调用方传入 project_name（来自 web 上传时的 form 字段）或 None
2. 若 None，按 binary_cache 中的 .so 名自动检测
3. 没匹配到 → 加载 _generic 包（通用 fallback，跳过项目特化部分）

每个 .yaml 缓存为 dict；多次调用同一项目零 I/O 开销。
"""

import os

import yaml

# projects/ 目录在仓库根（simpleperf/simpleperf_analyzer/project_pack.py
# 上溯 3 级：simpleperf_analyzer → simpleperf → repo root → projects）。
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
PROJECTS_DIR = os.path.join(REPO_ROOT, "projects")

GENERIC_PACK_NAME = "_generic"


class ProjectPack:
    """Lazily-loaded YAML knowledge pack for a single project.

    Files under projects/<name>/*.yaml become attributes; missing files
    return empty dict so callers can call .get() without checking.
    """

    def __init__(self, name: str):
        self.name = name
        self.dir = os.path.join(PROJECTS_DIR, name)
        if not os.path.isdir(self.dir):
            raise ValueError(f"project pack not found: {self.dir}")
        # Eager-load all 8 yaml files (small; total ~30KB across pack).
        self.pack = self._load_yaml("pack.yaml")
        self.business_modules = self._load_yaml("business-modules.yaml").get("modules", []) or []
        probes_doc = self._load_yaml("probes.yaml")
        self.probes = probes_doc.get("probes", []) or []
        self.main_probe_scan = probes_doc.get("mainProbeScan", []) or []
        self.annotations_doc = self._load_yaml("annotations.yaml")
        self.slot_matchers_doc = self._load_yaml("slot-matchers.yaml")
        self.burst_jobs = self._load_yaml("burst-jobs.yaml").get("burstJobs", []) or []
        self.caller_modules_doc = self._load_yaml("caller-modules.yaml")
        self.layer_tokens_doc = self._load_yaml("layer-tokens.yaml")
        self.analyst_rules_doc = self._load_yaml("analyst-rules.yaml")

    # ---- annotations.yaml accessors ----
    @property
    def label_rewrites(self):
        return self.annotations_doc.get("labelRewrites") or []

    @property
    def annotations(self):
        return self.annotations_doc.get("annotations") or []

    @property
    def child_hints(self):
        return self.annotations_doc.get("childHints") or {}

    @property
    def short_fn_rewrites(self):
        return self.annotations_doc.get("shortFnRewrites") or []

    @property
    def business_keywords(self):
        return self.annotations_doc.get("businessKeywords") or []

    # ---- slot-matchers.yaml accessors ----
    @property
    def slot_matchers(self):
        return self.slot_matchers_doc.get("slotMatchers") or {}

    @property
    def hot_module_ids(self):
        return frozenset(self.slot_matchers_doc.get("hotModuleIds") or [])

    # ---- caller-modules.yaml accessors ----
    @property
    def caller_module_rules(self):
        return self.caller_modules_doc.get("callerModuleRules") or []

    @property
    def call_up_targets(self):
        return self.caller_modules_doc.get("callUpTargets") or []

    @property
    def caller_unclassified_label(self):
        return self.caller_modules_doc.get("unclassified") or "未分类"

    # ---- layer-tokens.yaml accessors ----
    @property
    def business_self_developer_natives(self):
        return self.layer_tokens_doc.get("businessSelfDeveloperNatives") or []

    @property
    def business_core_libs(self):
        return self.layer_tokens_doc.get("businessCoreLibs") or []

    @property
    def engine_libs(self):
        return self.layer_tokens_doc.get("engineLibs") or []

    @property
    def runtime_libs(self):
        return self.layer_tokens_doc.get("runtimeLibs") or []

    @property
    def noise_libs(self):
        return self.layer_tokens_doc.get("noiseLibs") or []

    # ---- analyst-rules.yaml accessors ----
    @property
    def watch_hints(self):
        return self.analyst_rules_doc.get("watchHints") or []

    @property
    def classify_business_libs(self):
        return self.analyst_rules_doc.get("classifyBusinessLibs") or []

    @property
    def classify_business_func_prefixes(self):
        return self.analyst_rules_doc.get("classifyBusinessFuncPrefixes") or []

    # ---- pack.yaml accessors ----
    @property
    def identify_so_names(self):
        ident = self.pack.get("identify") or {}
        return ident.get("selfDeveloperSoNames") or []

    # ---- private ----
    def _load_yaml(self, fn):
        fp = os.path.join(self.dir, fn)
        if not os.path.isfile(fp):
            return {}
        try:
            with open(fp, encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except (OSError, yaml.YAMLError):
            return {}


_PACK_CACHE: dict = {}


def load_project_pack(name: str = None, binary_cache: str = None) -> ProjectPack:
    """Return a ProjectPack for the named project, with auto-detection fallback.

    Resolution order:
    1. Explicit `name` matches projects/<name>/ → use it.
    2. PERFTOOL_PROJECT env var → use it.
    3. Auto-detect from binary_cache (scan for any pack's identify.selfDeveloperSoNames).
    4. _generic fallback.
    """
    cache_key = (name or "", binary_cache or "")
    if cache_key in _PACK_CACHE:
        return _PACK_CACHE[cache_key]

    resolved = _resolve_pack_name(name, binary_cache)
    pack = ProjectPack(resolved)
    _PACK_CACHE[cache_key] = pack
    return pack


def _resolve_pack_name(name: str, binary_cache: str) -> str:
    if name:
        if os.path.isdir(os.path.join(PROJECTS_DIR, name)):
            return name
    env_name = os.environ.get("PERFTOOL_PROJECT")
    if env_name and os.path.isdir(os.path.join(PROJECTS_DIR, env_name)):
        return env_name
    if binary_cache and os.path.isdir(binary_cache):
        for project in _list_real_projects():
            try:
                tmp = ProjectPack(project)
            except ValueError:
                continue
            for so_name in tmp.identify_so_names:
                if _bcache_contains(binary_cache, so_name):
                    return project
    return GENERIC_PACK_NAME


def _list_real_projects():
    if not os.path.isdir(PROJECTS_DIR):
        return []
    return [
        d for d in sorted(os.listdir(PROJECTS_DIR))
        if not d.startswith("_")
        and not d.startswith(".")
        and os.path.isdir(os.path.join(PROJECTS_DIR, d))
    ]


def _bcache_contains(binary_cache: str, lib_substr: str) -> bool:
    for root, _dirs, files in os.walk(binary_cache):
        for fn in files:
            if lib_substr in fn:
                return True
    return False


def detect_project_from_libs(libs: list) -> str:
    """Auto-detect project name by scanning a list of lib basenames (from
    diff JSON / simpleperf-profile JSON) for any project's
    identify.selfDeveloperSoNames marker.

    Returns the project pack name (a string) or None if no project matches.
    Sets PERFTOOL_PROJECT env var as a side effect so subsequent default
    load_project_pack() calls hit the same pack.
    """
    if not libs:
        return None
    lib_names = []
    for lib in libs:
        if isinstance(lib, str):
            lib_names.append(lib)
        elif isinstance(lib, dict):
            lib_names.append(lib.get("lib") or lib.get("name") or "")
    for project in _list_real_projects():
        try:
            pack = ProjectPack(project)
        except ValueError:
            continue
        markers = pack.identify_so_names
        if not markers:
            continue
        for marker in markers:
            for lib in lib_names:
                if marker in lib:
                    os.environ["PERFTOOL_PROJECT"] = project
                    reset_cache()
                    return project
    return None


def reset_cache():
    """Test hook: clear the LRU so subsequent calls re-load YAML."""
    _PACK_CACHE.clear()
