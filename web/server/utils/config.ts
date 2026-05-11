import path from 'path';
import fs from 'fs';
import type { ServerConfig } from '../../shared/types.js';

const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  dataDir: path.resolve(import.meta.dirname, '../../data'),
  maxUploadSize: '200mb',
  retentionDays: 0, // 0 = 永久保留
  skillProjectPath: path.resolve(import.meta.dirname, '../../../'), // 项目根目录
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

    // 确保数据目录存在
    ensureDir(cfg.dataDir);
    ensureDir(path.join(cfg.dataDir, 'uploads'));
    ensureDir(path.join(cfg.dataDir, 'results'));

    _config = cfg;
  }
  return _config;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
