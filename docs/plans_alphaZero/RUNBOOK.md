# AzulZero 训练运行手册（Mac mini）

计划见 [README.md](README.md)。这份是**你在训练机上照着敲的操作步骤**。

---

## 1. 一次性准备

```bash
git clone <repo> && cd Azul/backend
python3.12 -m venv .venv
.venv/bin/pip install -e ".[zero,dev]"
```

`[zero]` 装 numpy + torch。torch 在 Apple Silicon 上自带 MPS 后端，不需要额外装 CUDA。

自检（约 1 分钟，必须全绿再开训）：

```bash
.venv/bin/python -m pytest tests/test_zero.py tests/test_zero_torch.py -q
```

确认 MPS 可用：

```bash
.venv/bin/python -c "import torch; print('mps:', torch.backends.mps.is_available())"
```

---

## 2. 起训

```bash
.venv/bin/python -m zero.loop --run runs/v1 --generations 500 --device mps
```

默认参数即 README 的配置：每代 250 局自对弈、400 sims/步、1000 训练 step、200 局 gating。
建议放进 `tmux` / `screen`，或用 `nohup ... > runs/v1/stdout.log 2>&1 &`。

**先做一次 15 分钟的小规模试跑**，确认吞吐和落盘正常，再开长跑：

```bash
.venv/bin/python -m zero.loop --run runs/smoke --generations 3 \
  --games 30 --simulations 400 --in-flight 16 \
  --steps 200 --batch 128 --min-buffer 3000 \
  --gate-games 20 --gate-simulations 200 \
  --width 128 --blocks 3 --device mps
```

### 关键参数

| 参数 | 含义 | 调法 |
|---|---|---|
| `--simulations` | 每步 MCTS 模拟数 | **不要低于 400**。Azul 每步 15–60 个合法着法，模拟数低于分支因子时访问分布退化成均匀分布，policy 目标就没有信息了（见 README §4.1b） |
| `--in-flight` | 同时推进的对局数 = 网络 batch 大小 | 吞吐的主要旋钮。MPS 上从 32 起调，看 `selfplay_seconds` 往上加到不再变快为止 |
| `--games` | 每代自对弈局数 | 250 左右；太小则每代数据被反复训练，过拟合 |
| `--steps` | 每代训练步数 | 保持 `steps × batch ≈ 每代新增样本数的 2–4 倍` |
| `--capacity` | replay 窗口 | 内存换稳定性。250k 约占 380MB |
| `--width/--blocks` | 网络大小 | 默认 512×4（约 1.5M 参数）。棋力饱和后再上 1024×6 并重跑 gating |

---

## 3. 盯盘

```bash
tail -f runs/v1/log.jsonl
```

每代一行 JSON。

**只有 `anchors` 能回答"是不是真的在学"。** 其余所有数字都是拿这个网络的另一个副本量出来的，
共享同一个盲点。开发时实测过一次：自对弈分数、policy loss、gate 分数（对冻结对手从 2% 爬到 53%）
全都在好转，而权重对外部对手的贡献是**零**——训练后对 `random` 76.7%，未训练 75.0%，
那 77% 全是搜索打出来的。所以：

- `anchors` —— 对 `random` / `greedy` 的胜率，默认每 10 代测一次（`--anchor-every`）。
  **这条曲线不涨，就是没在学**，不管其他数字多好看。参考：random 约 1 分、greedy 约 35–40 分、
  minimax 约 55 分。
- `value_loss` —— 应在前几代快速下降后缓慢下行。长期贴近 0 说明过拟合（调大 `--games` 或 `--capacity`）。
- `policy_targets` —— 本代被判定"信息量足够"、真正用于训练 policy 的样本数。第 1 代通常很低
  甚至为 0（正常，见下），之后应稳定在 50% 以上。长期为 0 说明搜索一直没在做决策，
  检查 `--simulations`。
- `mean_winning_score` / `gate_score` —— 参考值，**不要单独据此判断进度**。

### 什么是正常的

- **前几代 `promoted: false`、`policy_targets` 很低、棋力接近随机，都是正常的。**
  Azul 的搜索在最后一轮之前碰不到真终局，所以第 1 代没有任何 value 信号，
  访问分布是均匀的，这些 policy 目标会被自动丢弃（README §4.1b）。要等 value 头先学会。
- 中后期连续几代 gate 失败很常见，说明接近当前网络容量的平台期。
- **不要**把自对弈改回用 `best`：那会死锁在随机权重上（README §4.1b 第 2 条）。
- **不要**把 value 头也零初始化：那会让所有叶子恒为 0，直接触发 policy 崩溃（第 3 条）。

### 什么是不正常的

| 症状 | 排查 |
|---|---|
| `anchors` 几十代不涨 | 这是唯一真正要紧的症状。先确认 `policy_targets` 不是长期 0；再确认 `--simulations ≥ 400`；再看 `value_loss` 是否在降 |
| `policy_targets` 长期接近 0 | 搜索没在做决策。加大 `--simulations`，或确认 value 头没有被误改成零初始化 |
| 分数持续 < 5 分且 anchors 不涨 | 网络在倒垃圾（README §4.1b 第 1 条的崩溃模式）。确认 `min_policy_kl` 没被调成 0 |
| `value_loss` 不降 | 学习率/容量问题，先把 `--steps` 加倍试 |
| 每代耗时暴涨 | replay 落盘变大属正常；`selfplay_seconds` 暴涨则是 `--in-flight` 设得过大导致换页 |

中断后直接用**同一条命令**重跑即可，`runs/v1/state.json` 会接着上次的代数继续。

---

## 4. 导出权重给线上用

每次晋升会自动写 `runs/v1/azulzero.npz`。装进服务端：

```bash
cp runs/v1/azulzero.npz backend/zero/weights/azulzero.npz
```

装好后 `azulzero` 等级自动出现在 `GET /api/levels`、CLI 和前端下拉框里；没装则自动隐藏，
其余四个等级完全不受影响。线上推理只用 numpy 读这个 `.npz`，**web 进程不需要装 torch**。

临时指定别的权重：

```bash
AZULZERO_WEIGHTS=/path/to/other.npz .venv/bin/python -m scripts.benchmark --p0 azulzero --p1 mcts --games 100 --swap
```

---

## 5. 验收（README §7）

对三个现役等级跑锚点对局：

```bash
.venv/bin/python -m scripts.benchmark --p0 azulzero --p1 mcts    --games 400 --swap --workers 4 --report
.venv/bin/python -m scripts.benchmark --p0 azulzero --p1 minimax --games 200 --swap --workers 4 --report
.venv/bin/python -m scripts.benchmark --p0 azulzero --p1 greedy  --games 200 --swap --workers 4 --report
```

`--report` 会把结果按现有格式追加进 `docs/ai_benchmarks.md`。

发布 v1 的判据：vs mcts ≥ 90%（Wilson 下界 ≥ 85%）、vs minimax ≥ 98%、Elo 平台期、
20 局棋谱人工检查、成员实战全负。

---

## 6. 长跑注意

单次自对弈代不会有输出直到整代跑完（默认 250 局）。如果 `log.jsonl` 超过**一小时**没有新行，
去查进程是不是卡住了，而不是继续干等：

```bash
ps aux | grep zero.loop
tail -20 runs/v1/stdout.log
```
