# AzulZero — AlphaZero 式终极 Azul AI 训练计划

> 目标：在保留现有 greedy / minimax / mcts 三个人类可玩等级的基础上，训练一个**人类无法打败**的第五等级 `azulzero`（2 人局），并接入现有 registry / benchmark / Web 对战流程。
>
> 现状基础（已具备，直接复用）：
> - `engine/`：完整规则引擎，`Action.action_id` 已定义 **180 维离散动作空间**（source 0–5 × color 0–4 × dest 0–5）。
> - `ai/base.py` Agent 协议、`ai/registry.py` 等级注册、`scripts/benchmark.py` 配对换先 + Wilson 区间的评测框架。
> - 现有最强基线：MCTS(450ms) 对 Minimax(d4) 胜率 67.9%。

---

## 0. 总体架构一览

```
selfplay workers (N 进程, 各自跑 MCTS 自对弈)
      │  (state, π, z) 样本
      ▼
Replay Buffer (磁盘分片 .npz, 最近 ~50 万局面滑动窗口)
      ▼
Trainer (单 GPU / Apple MPS, policy+value 双头损失)
      ▼
候选权重 ──► Gating Arena (vs 当前最佳, 换先 400 局) ──► 晋升为 best.pt
      │                                                    │
      └────────────── selfplay 换用最新 best ◄─────────────┘
```

一律放在 `backend/zero/` 包内，训练产物放 `backend/zero/runs/<run-id>/`（gitignore，只提交最终权重的下载脚本或 LFS）。

---

## 1. 游戏性质分析（为什么 Azul 不能照抄围棋版 AlphaZero）

| 性质 | Azul 事实 | 对策 |
|---|---|---|
| 完全信息 | 桌面全部公开；袋中剩余瓷砖构成也是公开可推算的 | 状态编码里加入袋/弃牌堆的颜色计数 |
| **随机性** | 每轮开始从袋中随机补 5 个圆盘（20 砖），这是唯一随机源 | 见 §4「机会节点」：MCTS 在轮界处做**采样展开**（每次到达轮界重新随机补盘），网络只学期望值 |
| 分支因子 | 每步合法动作 ~20–60（上限 180） | 小，MCTS 很便宜，模拟次数可以给高（800–1600/步） |
| 对局长度 | 2 人局约 5 轮 × ~16 步 ≈ 80 ply | 短，自对弈吞吐高 |
| 得分非零和感知 | 胜负由分差决定，且平局判 row 数 | value 目标用 z = win/loss ±1，辅以缩放分差（§5 损失） |

结论：这是个**小规模 AlphaZero 任务**，单机（一块消费级 GPU 或 M 系列 Mac 的 MPS）数天内可以训到超人水平；难点在随机轮界的正确处理与工程吞吐，不在算力。

---

## 2. Phase Z1 — 基础设施（预计 2–3 天）

### 2.1 状态编码 `zero/encode.py`

以"当前行动玩家视角"编码为固定向量/平面（2 人局）。建议扁平向量 + 少量 embedding 而非图像卷积——Azul 没有空间平移不变性，**MLP/Transformer-lite 比 ResNet 更合适**：

- 每个圆盘（5 个）+ 中心区：各 5 色计数 → 6×5 = 30（归一化 /4，中心 /12）
- 先手标记是否还在中心：1
- 双方玩家面板（自己在前）：
  - 暂存行 5 行：每行 (颜色 one-hot 5 + 数量/行容量 1) → 30
  - 墙 5×5 二值 → 25
  - 罚分行数量 /7 → 1，先手标记在手 → 1
  - 当前分数 /100 → 1
  - 小计 58 × 2 人 = 116
- 袋中 + 弃牌堆各 5 色计数 /20 → 10
- 轮数 /5、本轮已走步数归一化 → 2

合计约 **160 维**。写 `encode_state(state, player) -> np.float32[160]`，配 20+ 条单测（对称性：交换玩家后视角互换；与 engine 的既有测试局面比对手算值）。

### 2.2 网络 `zero/model.py`（PyTorch）

- 主干：MLP，160 → 512 → (残差块 ×4，每块 512→512 两层 + LayerNorm + skip)
- Policy 头：512 → 180 logits，推理时对非法动作 mask 后 softmax
- Value 头：512 → 64 → 1，tanh 输出 ∈ (−1, 1)
- 参数量 ~1.5M，CPU 推理亦可毫秒级——**这是线上 500ms 限时可用的关键**
- 留一个 `width/blocks` 配置项，后期若饱和可升到 1024×6

### 2.3 高速引擎路径

自对弈瓶颈在 Python 引擎的 `legal_actions`/`apply` 速度。先 profile：
1. 若单步 < 50µs 可接受，直接用现有引擎；
2. 否则做 `zero/fastgame.py`：用 numpy 数组重写状态 + apply（保持与 engine 的黄金测试对拍——随机走 10 万步，逐步断言两实现状态一致）。**不允许两套规则漂移**，对拍测试进 CI。

### 2.4 出口条件（Z1）

- 编码/网络/（可选）fastgame 全部有测试；随机权重下 MCTS+NN 能完整自对弈 100 局不崩。

---

## 3. Phase Z2 — MCTS(PUCT) 实现 `zero/mcts.py`（预计 2 天）

标准 AlphaZero 变体：

- 节点存 `N, W, Q, P`；选择用 PUCT：`Q + c_puct · P · √ΣN / (1+N)`，`c_puct ≈ 1.5`（后期用 arena 调）
- 叶子扩展时调用网络（见 §6 批量推理），value 以"当前节点行动方"视角回传，逐层取反
- 根节点加 Dirichlet 噪声：`α = 10/平均合法动作数 ≈ 0.3`，ε = 0.25（仅自对弈时）
- **机会节点（核心差异点）**：当一步动作触发轮结算 + 补盘时，子节点是随机的。做法：**不建机会节点**，每次模拟穿过轮界时按当前袋实际分布现场随机补盘（引擎带 seed 的 refill），同一父节点的多次访问自然采样不同轮开局，Q 收敛到期望值。终局（第 5 轮或有人完成一行）无随机，正常回传。
  - 注意：这要求树在轮界处**截断为叶子并直接用 value 估计**，或者允许"同一动作多次到达不同子状态"——取简单方案：轮界动作的子节点不入树，展开时 rollout 到新轮的确定状态再求网络 value。实现时二选一，先做截断版。
- 温度策略：前 20 ply τ=1（按访问数采样），之后 τ→0（argmax）
- 自对弈模拟次数：起步 **400 sims/步**，训练中期升 800

出口条件（Z2）：随机初始化网络 + 400 sims 的 zero-MCTS 对 `greedy` 胜率 ≥ 40%（纯搜索就该有基本棋力）；单步耗时在自对弈配置下 < 1s（CPU）。

---

## 4. Phase Z3 — 自对弈与训练闭环（预计 3–4 天写完，之后持续跑）

### 4.1 自对弈 worker `zero/selfplay.py`

- 每局记录 `(encoded_state, π_visit_dist_180, player)`，终局回填 `z`
- `z = w·sign_win + (1−w)·tanh(score_margin / 20)`，`w = 0.7`——纯 ±1 会重演现有 MCTS"赢面下选保守线"的毛病，混入分差项让它学会碾压（对"人类无法打败"的观感很重要）
- 多进程：`multiprocessing` 起 N=物理核数 个 worker，共享只读权重（每 K 局 reload best.pt）
- 数据增强：Azul 唯一合法对称是**圆盘编号置换**（5! 种）与颜色置换（考虑墙的固定配色，颜色置换需同步旋转墙列——先只做圆盘置换，简单且正确）。每局面随机取 4 个置换写入 buffer

### 4.2 Trainer `zero/train.py`

- 损失：`L = (z − v)² − πᵀ·log p + 1e-4·‖θ‖²`（非法动作位不参与 CE）
- 优化：AdamW，lr 1e-3 → cosine 到 1e-4；batch 512；每代训练 ~1000 step
- Replay buffer：最近 500k 样本（约 2–3 千局 × 增强），淘汰旧代

### 4.3 Gating `zero/arena.py`

- 候选 vs 当前 best：400 局换先（复用 benchmark.py 的配对框架），**胜率 ≥ 55%（Wilson 下界 > 50%）才晋升**
- 每代同时跑锚点评测：vs `mcts(450ms)`、vs `minimax(d4)` 各 200 局，曲线写入 `docs/ai_benchmarks.md` 同款格式

### 4.4 训练日程（单机预估）

| 里程碑 | 判据 | 预估 |
|---|---|---|
| M1 起飞 | 超越随机初始网络的裸 MCTS | ~5k 局自对弈（数小时） |
| M2 追平现役 | vs mcts(450ms) ≥ 50% | ~30k–50k 局（1–2 天） |
| M3 碾压现役 | vs mcts(450ms) ≥ 80%，vs minimax ≥ 95% | ~100k 局（3–5 天） |
| M4 超人判据 | 见 §7 | 持续训练至 Elo 曲线平台期 + 200 局 |

若 M2 迟迟不到，按序排查：value 视角符号错误（最常见 bug）→ 轮界采样偏差 → 学习率/温度 → 网络容量。

---

## 5. Phase Z4 — 产品化接入（预计 1–2 天）

- `ai/azulzero_agent.py`：实现 `Agent` 协议。线上推理配置：**800 sims 或 450ms 截止先到为准**；无 Dirichlet 噪声、τ=0；权重懒加载 + 进程内单例
- `ai/registry.py`：`LEVELS += ("azulzero",)`；torch 为可选依赖（`pyproject.toml` extra `[zero]`），未安装时 registry 隐藏该等级并给出友好报错
- 前端：新增等级选项 + "终极 AI"标识；后端 `schemas.py` 等级枚举同步
- 权重发布：`backend/zero/weights/azulzero-v1.pt`（<10MB 可直接进 repo，否则 release asset + 下载脚本）
- 测试：`tests/test_azulzero.py` —— 加载权重、单步合法性、500ms 限时、确定性（同 seed 同步）

---

## 6. 工程优化清单（按需启用，不预做）

1. **批量推理**：单 worker 内做 8–16 路并行 MCTS（virtual loss），凑 batch 喂网络——GPU 上 5–10× 吞吐
2. fastgame numpy 化（§2.3）
3. 推理导出 TorchScript / ONNX，线上 CPU 推理免 torch 重依赖
4. 训练曲线用 tensorboard；每代 arena 结果自动追加 markdown

## 7. "人类无法打败"的验收定义

不可直接测人类，用替代判据，全部满足即宣布 v1：

1. vs `mcts(450ms)` ≥ **90%**（换先 400 局，Wilson 下界 ≥ 85%）
2. vs `minimax(d4)` ≥ **98%**
3. 自我 Elo 曲线连续 3 代晋升失败（到达平台）
4. 人工检查 20 局棋谱：无罚分失误、终局行/列/色奖励规划明显、会做 hate-draft（拿走对手关键色）
5. 邀请测试：项目成员各打 5 局全负

## 8. 风险与备刀

| 风险 | 备刀 |
|---|---|
| 轮界随机采样让 value 噪声大、训练不稳 | 改为"轮界后抽 K=4 个补盘取均值"的显式期望；或把补盘結果并入状态编码训练 afterstate 网络 |
| Python 自对弈太慢，M3 遥遥无期 | fastgame numpy 化；再不行用 C 扩展重写 apply（规则已被测试锁死，重写风险可控） |
| 500ms 内 800 sims 不够打满棋力 | 线上放宽 azulzero 专属限时到 2s（产品决策），或蒸馏出纯 policy 网络做 anytime 兜底 |
| 网络容量饱和 | 512×4 → 1024×6，重跑 gating |

## 9. 执行顺序摘要

1. Z1：`zero/encode.py` + `zero/model.py` + 对拍/单测
2. Z2：`zero/mcts.py`（含轮界采样），裸网络打过 greedy
3. Z3：selfplay + train + arena 闭环，跑到 M3
4. Z4：`azulzero` 等级接入 registry/前端/benchmark 文档
5. 按 §7 验收，发布 v1 权重
