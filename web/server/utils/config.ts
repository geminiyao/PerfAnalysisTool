import path from 'path';
import fs from 'fs';
import type { ServerConfig } from '../../shared/types.js';
import { detectCliExecutable } from './cli-resolver.js';

const defaultProjectRoot = findProjectRoot(import.meta.dirname);
// 统一数据目录: 无论从 tsx(dev/ingest) 还是 dist/server(production) 启动都指向 web/data，
// 避免编译后 import.meta.dirname 落在 dist/server 下产生另一份空 db.sqlite。
const defaultDataDir = path.join(defaultProjectRoot, 'web', 'data');

const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  dataDir: defaultDataDir,
  maxUploadSize: '200mb',
  retentionDays: 0, // 0 = 永久保留
  skillProjectPath: defaultProjectRoot, // 项目根目录
  storageBackend: 'local',
  assetStorageDir: path.join(defaultDataDir, 'assets'),
  cdnEnabled: false,
  cdnProvider: 'placeholder',
  remoteStorageConfigured: false,
  cliPaths: {}, // 不配则使用 PATH 中的命令名
};

let _config: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (!_config) {
    const cfg: ServerConfig = { ...DEFAULT_CONFIG };

    // 尝试读取配置文件
    const configPath = path.resolve(import.meta.dirname, '../../config.json');
    if (fs.existsSync(configPath)) {
      try {
        const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        Object.assign(cfg, userConfig);
        // 合并 cliPaths（深合并）
        if (userConfig.cliPaths) {
          cfg.cliPaths = { ...DEFAULT_CONFIG.cliPaths, ...userConfig.cliPaths };
        }
      } catch {
        console.warn('Failed to parse config.json, using defaults');
      }
    }

    // 环境变量覆盖
    if (process.env.PERF_DATA_DIR) cfg.dataDir = process.env.PERF_DATA_DIR;
    if (process.env.PERF_PORT) cfg.port = Number(process.env.PERF_PORT);
    if (process.env.CODEBUDDY_PATH) cfg.cliPaths.codebuddy = process.env.CODEBUDDY_PATH;
    if (process.env.CLAUDE_CLI_PATH) cfg.cliPaths.claude = process.env.CLAUDE_CLI_PATH;
    if (process.env.UNITY_PROJECT_PATH) cfg.sourceProjectPath = process.env.UNITY_PROJECT_PATH;

    cfg.storageBackend = cfg.storageBackend || 'local';
    cfg.assetStorageDir = cfg.assetStorageDir || path.join(cfg.dataDir, 'assets');
    cfg.cdnEnabled = cfg.cdnEnabled ?? false;
    cfg.cdnProvider = cfg.cdnProvider || 'placeholder';
    cfg.remoteStorageConfigured = cfg.remoteStorageConfigured ?? false;

    cfg.skillProjectPath = resolveSkillProjectPath(cfg.skillProjectPath || defaultProjectRoot, defaultProjectRoot);

    // Windows: Node 服务进程 PATH 常不含 npm 全局 bin，自动探测 codebuddy.cmd
    if (!cfg.cliPaths.codebuddy) {
      const codebuddy = detectCliExecutable('codebuddy');
      if (codebuddy) cfg.cliPaths.codebuddy = codebuddy;
    }
    if (!cfg.cliPaths.claude) {
      const claude = detectCliExecutable('claude');
      if (claude) cfg.cliPaths.claude = claude;
    }

    // 确保数据目录存在
    ensureDir(cfg.dataDir);
    ensureDir(path.join(cfg.dataDir, 'uploads'));
    ensureDir(path.join(cfg.dataDir, 'results'));
    ensureDir(cfg.assetStorageDir);
    ensureDir(path.join(cfg.assetStorageDir, 'raw', 'pdata'));
    ensureDir(path.join(cfg.assetStorageDir, 'raw', 'simpleperf'));
    ensureDir(path.join(cfg.assetStorageDir, 'raw', 'perfetto'));
    ensureDir(path.join(cfg.assetStorageDir, 'generated', 'reports'));
    ensureDir(path.join(cfg.assetStorageDir, 'generated', 'flamegraphs'));
    ensureDir(path.join(cfg.assetStorageDir, 'generated', 'summaries'));

    _config = cfg;
  }
  return _config;
}

/**
 * 动态更新配置并持久化到 config.json。
 * 只合并传入的字段，其余保持不变。
 */
export function updateConfig(partial: Partial<ServerConfig>): ServerConfig {
  const cfg = getConfig();
  Object.assign(cfg, partial);

  const configPath = path.resolve(import.meta.dirname, '../../config.json');
  let persisted: Record<string, any> = {};
  if (fs.existsSync(configPath)) {
    try { persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* ignore */ }
  }
  Object.assign(persisted, partial);
  fs.writeFileSync(configPath, JSON.stringify(persisted, null, 2), 'utf-8');

  return cfg;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** config.json 可能含 Linux 路径；无效时回退到自动检测的项目根。 */
function resolveSkillProjectPath(configured: string, fallback: string): string {
  const marker = path.join(configured, 'simpleperf', 'build_simpleperf_profile.py');
  if (fs.existsSync(marker)) return configured;
  const fbMarker = path.join(fallback, 'simpleperf', 'build_simpleperf_profile.py');
  if (configured !== fallback && fs.existsSync(fbMarker)) {
    console.warn(`[config] skillProjectPath 无效 (${configured})，已回退到 ${fallback}`);
    return fallback;
  }
  return configured;
}

function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(current, '.claude', 'skills', 'unity-profiler-analysis', 'SKILL.md')) ||
      fs.existsSync(path.join(current, 'web', 'package.json'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir, '../../../');
}
