"""drivers/ - 采集工具 Driver 热插拔包（C2 CL-7）

统一 Driver 接口：start / stop / pull。
YAML 声明 tools: [simpleperf, perfetto] → 对应 driver 按序启停。

注册表机制：新 Driver 只需 @register_driver("name") 装饰 + 实现接口。
"""
