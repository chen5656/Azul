# 模块计划 01 — 规则引擎 + CLI 验证工具（Day 1-3）

## 目标

一个**纯 Python、零第三方依赖、完全确定性**的 Quadro 2 人规则引擎，外加一个**终端可玩客户端**，让规则正确性在第 3 天就能被人眼验证。

引擎是全项目地基：AI 搜索每秒调用它数万次，服务端用它做权威裁判，回放用它做一致性校验。三条硬性要求：

1. **正确**：覆盖全部边界情形（第 2 节逐条列出 E1~E12），并由人工对局复核。
2. **快**：`legal_actions` + `apply_action` 单次往返 < 50µs 量级（纯 Python 可达）；不做过早优化（无 Numba/NumPy），靠紧凑数据结构达标。
3. **可复现**：同一 seed 下整局料序完全一致；状态可 JSON 往返无损。

## 1. 数据结构

### 1.1 常量（constants.py）

```python
NUM_COLORS = 5                    # 0=BLUE 1=YELLOW 2=RED 3=BLACK 4=WHITE
NUM_DISPLAYS = 5                  # 2 人局
TILES_PER_COLOR = 20
DISPLAY_SIZE = 4
GRID_SIZE = 5
STAGING_CAPACITY = (1, 2, 3, 4, 5)
PENALTIES = (-1, -1, -2, -2, -2, -3, -3)   # 罚分行 7 槽
PENALTY_ROW_SIZE = 7
FIRST_TOKEN = -1

def grid_color(row: int, col: int) -> int:
    return (col - row) % 5

def grid_col(row: int, color: int) -> int:   # 某色在某行的列位置
    return (color + row) % 5
```

颜色用 `int 0..4` 而非枚举类——搜索热路径上省掉属性访问开销；对外序列化时再映射为字符串名。

### 1.2 玩家板（state.py — PlayerBoard）

```python
@dataclass
class PlayerBoard:
    staging_colors: list[int]     # 长度 5；每行当前颜色，-1 表示空行
    staging_counts: list[int]     # 长度 5；每行已放数量
    grid: list[list[bool]]        # 5x5；True 表示已结算
    penalty_tiles: list[int]      # 罚分行上的方块色序列（先手标记记为 -1），len ≤ 7
    penalty_overflow: int         # 超出 7 槽直接进弃料盒的数量（仅统计用）
    score: int                    # 当前分数，任何时刻 ≥ 0
    has_first_token: bool         # 本轮是否持有先手标记（决定下轮先手）
```

- `grid` 不存颜色——`grid_color(r,c)` 是固定映射，存 bool 即可。
- `penalty_tiles` 存实际色而非仅计数，因为轮末这些方块要按色归还弃料盒（先手标记除外）。

### 1.3 全局状态（state.py — GameState）

```python
@dataclass
class GameState:
    displays: list[list[int]]     # 5 个展台，每个是长度 5 的各色计数
    center: list[int]             # 中央池各色计数
    center_has_token: bool        # 先手标记是否还在中央池
    bag: list[int]                # 袋中各色计数
    discard: list[int]            # 弃料盒各色计数
    players: list[PlayerBoard]    # 长度 2
    current: int                  # 当前行动玩家 0/1
    round_num: int                # 从 1 开始
    phase: Phase                  # DRAFTING / GAME_OVER（结算是原子操作，无独立相位）
    rng_state: tuple              # random.Random.getstate()，随状态保存以支持精确回放
```

**设计判断 1 — 袋子存计数而非序列**：袋中方块的*构成*是公开信息（100 减去所有可见与已弃），只有*抽取顺序*随机。抽取时按当前计数加权随机抽即可，等价于洗牌后顺序抽取，且状态更紧凑、序列化更简单。

**设计判断 2 — 可变状态 + 显式 undo**（初稿写的是 Immutable，此处推翻）：对外 API 用**可变状态 + `clone()`**（简单不易错）；为搜索另提供 `apply_action` 返回的 `Undo` 记录 + `undo_action`，Minimax/MCTS 热路径用 undo 避免深拷贝。两条路径必须被同一测试覆盖（同一动作序列，比对结果状态相等）。

### 1.4 动作编码

```python
@dataclass(frozen=True)
class Action:
    source: int    # 0..4 = 展台 D0..D4；5 = 中央池
    color: int     # 0..4
    dest: int      # 0..4 = 备料行行号；5 = 整组直接弃入罚分行
```

动作空间上界 6×5×6 = 180，实际每步合法动作通常 10~80 个。提供 `action_id = source*30 + color*6 + dest`（0..179）整数编码，供 AI 与协议使用。

## 2. 规则算法与全部边界判例

### 2.1 每轮开始（game.py — start_round）

1. 依次为每个展台从袋中抽 4 块（加权随机，用 `GameState` 内嵌的 `random.Random`）。
2. **袋空时**：将弃料盒全部倒回袋中，继续抽。
3. **袋与弃料盒都空时**：该展台保持不满员（能抽多少放多少），照常开始本轮。
4. 先手标记置于中央池（`center_has_token = True`）。
5. 第一轮先手由 seed 决定；之后由上轮持标记者先行。

- **E1**：抽到一半袋空 → 倒回弃料盒后**继续补完当前展台**，不是跳过。
- **E2**：全部 100 块都在玩家板/展台上（理论极端）→ 允许 0 料展台，轮次照常。

### 2.2 合法动作生成（rules.py — legal_actions）

对每个非空来源（含中央池）× 该来源存在的每种颜色 × 每个目的地：

目的地为备料行 `r` 合法当且仅当：
- `grid[r][grid_col(r, color)] == False`（网格该行未有该色）；且
- 该行为空（`staging_colors[r] == -1`），或该行颜色等于 `color` 且未满（`staging_counts[r] < r+1`）。

目的地为罚分行（`dest=5`）**总是合法**（允许整组主动弃置）。

- **E3**：某色对所有备料行都不合法时，仍必须能取（弃入罚分行）——玩家不能跳过回合。
- **E4**：已满的备料行不可再选，即使同色。
- **E5**：中央池只剩先手标记（无方块）时，中央池**不是**合法来源。

### 2.3 动作应用（rules.py — apply_action）

1. 从来源取走该色全部 n 块。来源是展台：其余方块全部推入中央池。来源是中央池且 `center_has_token`：标记转给当前玩家（`has_first_token = True`）并立即落入罚分行。
2. 目的地为备料行 r：设可放 `k = (r+1) - staging_counts[r]`，放入 `min(n, k)` 块并设定行颜色；溢出 `n - min(n,k)` 块落罚分行。目的地为罚分行：n 块全落罚分行。
3. **落罚分行规则**：逐块放入 `penalty_tiles`；已满 7 槽的方块改计入 `penalty_overflow` 并立即归入弃料盒（**先手标记例外**——罚分行已满时标记不占槽也不罚分，但玩家仍获得下轮先手）。
4. 换当前玩家。
5. 若所有展台与中央池均无方块（标记不算）→ 取料阶段结束，进入结算（2.4）。

- **E6**：从中央池首取，标记**先**占罚分行第一个空槽，然后才放方块溢出——顺序影响罚分归属，按"标记先入"实现。
- **E7**：一次取 5 块放容量 1 的行 → 1 块入行、4 块落罚分行。
- **E8**：罚分行已有 6 块，此次落 3 块 → 1 块入槽、2 块进弃料盒。

### 2.4 轮末结算（rules.py — settle_round）

对每个玩家（按玩家 0→1 固定顺序执行，保证事件流确定性）：

1. 自上而下检查 5 条备料行：满行（`count == r+1`）者取 1 块上网格 `(r, grid_col(r, color))`，其余 `r` 块入弃料盒，清空该行；未满行原样保留。
2. **每块新上网格的方块立即计分**（按行序逐一结算，因为同轮多行上格会互相影响连续段）：
   - `H` = 含新方块的水平连续段长度；`V` = 垂直连续段长度。
   - 得分 = `(H if H>=2 else 0) + (V if V>=2 else 0)`；若两者皆为 1，得 1 分。
3. 罚分结算：`penalty = sum(PENALTIES[:len(penalty_tiles)])`；`score = max(0, score + penalty)`。罚分行上的方块（非标记）归弃料盒；清空罚分行与 `penalty_overflow`。
4. 终局检查：任一玩家网格存在完整横行 → `phase = GAME_OVER`，执行终局加分（2.5）；否则 `round_num += 1`，先手 = 持标记者，回到 start_round。

- **E9**：同轮第 2 行和第 3 行同时上格且新方块垂直相邻 → 后结算的行必须看到先结算行的新方块（逐行顺序结算保证）。
- **E10**：H=1,V=3 → 得 3 分（不是 4）；H=3,V=4 → 得 7；H=1,V=1 → 得 1。
- **E11**：罚分把分数打到负 → 钳制为 0；终局加分从 0 起算。
- **E12**：触发终局的那一轮，**双方**都正常完成上格与计分后才结算终局加分。

### 2.5 终局加分与胜负

- 每完整横行 +2；每完整竖列 +7；每集齐 5 块同色 +10。
- 分高者胜；平分比完整横行数；仍平 → 共同获胜（`winner = None, draw = True`）。

### 2.6 事件流

`settle_round` 与 `apply_action` 返回结构化事件列表（`TilePlaced{player,row,col,points}`、`Penalty{player,points}`、`RoundEnd`、`GameEnd{scores,winner}` 等），供 CLI 与前端做渲染/日志，也构成回放文件内容。引擎本体不 print、不 log。

## 3. 对外 API

```python
# game.py
class QuadroGame:
    def __init__(self, seed: int | None = None): ...
    @property state -> GameState
    def legal_actions(self) -> list[Action]
    def step(self, action: Action) -> list[Event]     # 应用动作；触发轮末则自动结算并开新轮
    def is_over(self) -> bool
    def result(self) -> GameResult                    # scores, winner, tiebreak info

# state.py
GameState.clone() / to_dict() / from_dict()           # JSON 无损往返
# rules.py（供 AI 直接调用的低层接口，绕过事件构造以提速）
legal_actions(state) -> list[Action]
apply_action(state, action) -> Undo
undo_action(state, undo) -> None
```

## 4. CLI 验证工具（scripts/cli.py）— **本阶段的关键交付**

一个零依赖的终端客户端，直连引擎，让规则正确性可被人眼验证。这是"垂直切片优先"的第一片。

### 4.1 用法

```bash
python -m scripts.cli                      # 人 vs 人（热座），默认随机 seed
python -m scripts.cli --seed 42            # 指定种子，可复现
python -m scripts.cli --p1 random          # 人 vs Random（P3 之后可换 greedy/minimax/mcts）
python -m scripts.cli --auto random random --games 100   # 无渲染批量自对战（不变量检查）
python -m scripts.cli --replay game.json   # 重放一局记录
```

### 4.2 ASCII 渲染

每步重绘整个牌桌：

```
Round 3   Player 1 to move          Bag 41  Discard 12

Displays:                                Center:
  D0 [ B B Y . ]   D1 [ . . . . ]        R R R K W  (+first token)
  D2 [ Y K W W ]   D3 [ B B B R ]
  D4 [ . . . . ]

┌─ Player 0 (you) ──── 24 pts ─┐   ┌─ Player 1 ────────── 19 pts ─┐
│        . │ B y r k w         │   │        . │ b y r k w         │
│      Y Y │ b Y r k w         │   │      . . │ b y R k w         │
│    R R . │ b y R k w         │   │    B B B │ B y r k w         │
│  . . . . │ b y r k w         │   │  W . . . │ b y r K w         │
│. . . . . │ b y r k W         │   │. . . . . │ b y r k w         │
│ Penalty: [T][R][ ][ ][ ][ ][ ]  -2 │ Penalty: [ ]×7           0 │
└──────────────────────────────┘   └──────────────────────────────┘
```

- 大写 = 已放置，小写 = 网格空位（提示该格颜色），`.` = 备料行空位，`T` = 先手标记。
- 颜色若终端支持则用 ANSI 上色（`--no-color` 关闭）。

### 4.3 输入与合法动作提示

列出全部合法动作并编号，输入编号执行；也支持速记 `d2 y 3`（展台2 黄色 到备料行3）、`c r f`（中央池 红色 到罚分行）：

```
Legal moves:
  [0] D0 blue  -> row 1        [1] D0 blue  -> row 3
  [2] D0 blue  -> penalty      [3] D2 white -> row 2  (2 overflow, -2)
  ...
> 3
```

每个动作**预览后果**：放入几块、溢出几块、罚分变化——这既是给人玩的辅助，也逼着引擎把这些量算清楚（后续前端的"落点预览"直接复用同一函数）。

执行后打印本步产生的事件（得分明细），轮末打印结算详情：每块上格方块的 H/V 与得分、罚分、双方新比分。**这份逐步明细就是你核对规则的依据。**

### 4.4 命令

游戏中可用 `undo`（回退一步，用引擎 undo）、`save game.json`（导出记录）、`hint`（若 AI 已就绪，显示 Greedy 推荐）、`quit`。

## 5. 测试计划（tests/）

1. **单元判例**：E1~E12 每条一个测试；网格色位映射全 25 格断言；动作编码往返。
2. **计分表驱动测试**：~15 个网格局面 + 落点 → 期望得分（含 H+V 双向、单向、孤立、整行整列完成瞬间）。
3. **性质测试（fuzz 自对战）**：随机对随机跑 1000 局，每步断言不变量：
   - 全场方块数守恒恒等于 100（袋+弃料盒+展台+中央池+备料行+罚分行+网格）；
   - 每色总数恒等于 20；
   - 分数 ≥ 0；备料行内颜色一致且不超容量；网格每行每列每色至多 1；
   - 每局 ≤ 150 轮内必然终止（防死循环）。
4. **可复现性**：同 seed 两局动作序列与最终状态逐字节一致；`to_dict → from_dict → to_dict` 幂等。
5. **clone/undo 等价性**：同一动作序列走 clone 路径与 undo 路径，结果状态相等。

覆盖率目标：engine/ 分支覆盖 > 95%。

## 6. 实施顺序

| Day | 内容 |
|-----|------|
| 1 上午 | constants + state 数据结构 + 序列化 + clone |
| 1 下午 | legal_actions + apply_action/undo + 判例 E3~E8 |
| 2 上午 | settle_round + 计分 + 终局 + 判例 E9~E12 |
| 2 下午 | QuadroGame 驱动器 + start_round/洗袋 E1~E2 + 事件流 + fuzz 不变量测试 |
| 3 上午 | **CLI：渲染 + 输入 + 动作预览 + 事件明细** |
| 3 下午 | CLI 的 undo/save/replay；性能抽查；**人工对局验证** |

## 7. 出口条件（自动化 + 人工双通道）

- [ ] 全部单测与 fuzz 通过，engine 覆盖率 > 95%
- [ ] `--auto random random --games 1000` 无不变量违反
- [ ] 单步 `legal_actions + apply_action` 往返 < 50µs（抽查）
- [ ] 同 seed 复现一致；导出记录可重放
- [ ] **你在终端里完整打完至少 1 局**，逐轮核对：连击计分、先手标记归属与罚分、溢出、袋空洗回、终局加分——确认与规则一致

最后一条是本阶段真正的验收标准。单测容易写成"和实现一样错"，人工对局是独立的第二双眼睛。
