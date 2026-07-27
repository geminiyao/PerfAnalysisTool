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

**形态演化：** base 阶段 Running% 高达 86.94%，主线程呈纯 CPU-bound 形态，Gfx.WaitForPresent 单次仅 0.91 ms；cur 阶段 Running% 降至 77.82%、Sleeping% 升至 20.40%，进入算+等混合态，单次等待跳至 5.83 ms；throttle 阶段 Running% 继续跌至 56.99%，Sleeping% 攀升至 38.99%，单次等待达 17.80 ms，主线程已演化为半睡型 GPU-bound。

**主线程 binder 调用 server 进程：**
- base：pid=1873（system_server）× 11 次，totalMs=2.73ms，占比可忽略（<0.03% trace）
- cur：pid=1873（system_server）× 11 次，totalMs=2.78ms，占比可忽略
- throttle：system_server × 20 次，totalMs=6.44ms，占比仍可忽略（<0.04% trace）

结论：binder 调用在三态下占比均不超过 0.04% trace，不是主线程阻塞的主因。
