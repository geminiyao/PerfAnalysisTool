### §3.1 UnityMain（主线程）

**三态对照表：**

| 指标 | base | cur | throttle |
|---|---|---|---|
| Running% | 86.94% | 77.82% | 56.99% |
| Sleeping% | 12.04% | 20.40% | 38.99% |
| Runnable% | 0.97% | 1.62% | 2.83% |
| off-CPU total% | 13.01% | 22.02% | 41.82% |
| Gfx.WaitForPresent totalMs | 620.12 ms（5.43% trace）| 2828.21 ms（19.28% trace）| 7600.06 ms（38.08% trace）|
| Gfx.WaitForPresent 单次 avg | **0.91 ms** | **5.83 ms** | **17.80 ms** |
| off-CPU Sleeping 中 S 态占比 | 90.57% | 89.54% | 89.34% |

**形态演化：** base 阶段 Running% 达 86.94%，主线程以 CPU 计算为主，Gfx.WaitForPresent 单次均值仅 0.91 ms；进入 cur 后 Running% 降至 77.82%，Sleeping% 升至 20.40%，单次等待升至 5.83 ms，呈算力与 GPU 等待混合形态；throttle 阶段 Running% 进一步跌至 56.99%，Sleeping% 高达 38.99%，单次等待达 17.80 ms，主线程转为半睡型 GPU-bound 瓶颈。

**主线程 binder 调用 server 进程：**
- base：pid=1873（system_server）× 11 次，totalMs=2.73ms，占比可忽略（<0.03% trace）
- cur：pid=1873（system_server）× 11 次，totalMs=2.78ms，占比可忽略
- throttle：system_server × 20 次，totalMs=6.44ms，占比仍可忽略（<0.04% trace）

结论：binder 调用在三态中占比均低于 0.04% trace，不是主线程阻塞的主因。
