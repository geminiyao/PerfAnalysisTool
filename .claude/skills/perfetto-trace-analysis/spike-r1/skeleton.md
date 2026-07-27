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

**形态演化：** <!-- LLM_FILL: 1-3 句话总结 base→cur→throttle 的主线程瓶颈形态演化（CPU-bound / 算+等混合 / 半睡型 GPU-bound 三档）。必须引用本表 Running%、Sleeping% 和 Gfx.WaitForPresent 单次 avg 的数字，严禁新加任何不在本表的数字。30-60 字 Chinese。 -->

**主线程 binder 调用 server 进程：**
- base：pid=1873（system_server）× 11 次，totalMs=2.73ms，占比可忽略（<0.03% trace）
- cur：pid=1873（system_server）× 11 次，totalMs=2.78ms，占比可忽略
- throttle：system_server × 20 次，totalMs=6.44ms，占比仍可忽略（<0.04% trace）

结论：<!-- LLM_FILL: 一句话给出 binder 是不是主线程阻塞主因的判定，引用上面 binder 占比数字。15-30 字 Chinese。 -->
