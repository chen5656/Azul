# 模块计划 02 — 可玩垂直切片：最小服务端 + 最小 Web 客户端（Day 4-6）

## 目标

**三天内让你能在浏览器里打完一局。** 这一阶段刻意牺牲视觉与动画，只求端到端跑通：协议定型、交互闭环、AI 接口就位。之后的 AI（P3）和完整前端（P4）都是往这个已经能跑的骨架上挂东西，而不是攒到最后一次性集成。

范围内：REST + WebSocket、GameManager、AI 调度接口、能点能玩的网页（无动画、样式极简）、PvE 对 Random。
范围外（留给 P4）：动画、落点预览、动作日志面板、EvE 观战控制、热座 PvP、终局弹窗、视觉打磨。

## 1. REST 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/games` | 创建对局。body: `{mode: "pvp"\|"pve"\|"eve", ai0?: AiLevel, ai1?: AiLevel, seed?: int}`；`AiLevel = "random"\|"greedy"\|"minimax"\|"mcts"`。pve 时人类固定为 player 0。返回 `{game_id}` |
| GET | `/api/games/{id}` | 当前完整状态快照（与 WS 的 state 消息同构） |
| GET | `/api/games/{id}/log` | 动作日志导出（回放用，格式见 05 号计划） |
| DELETE | `/api/games/{id}` | 结束并清理对局 |

对局存于 `GameManager` 内存字典，1 小时无活动自动回收。**P2 只需实现 pve + random**，其余模式与难度在 P3/P4 逐步接入（枚举先定义好，避免协议返工）。

## 2. WebSocket 协议（`/ws/games/{id}`）

所有消息 `{type, ...payload}`，JSON。`schemas.py` 是协议的唯一事实来源，`docs/protocol.md` 由其整理而成（本阶段交付）。

### 客户端 → 服务端

| type | payload | 说明 |
|------|---------|------|
| `action` | `{source, color, dest}` | 提交动作（热座模式下服务端按 `state.current` 认定行动方） |
| `eve_control` | `{command: "play"\|"pause"\|"step", interval_ms?}` | EvE 播放控制（P4 才用，协议先留） |
| `resync` | `{}` | 请求全量状态重发 |

### 服务端 → 客户端

| type | payload | 说明 |
|------|---------|------|
| `state` | 完整 `GameStateView` | 每个动作后推送全量状态（状态 < 2KB，不值得做增量） |
| `events` | `Event[]` | 与 state 同批推送：引擎事件流（上格得分、罚分、轮末、终局） |
| `legal_actions` | `int[]` | action_id 列表；轮到人类时推送，前端据此高亮 |
| `ai_thinking` | `{player, level}` | AI 开始计算时推送 |
| `error` | `{code, message}` | `code`: `ILLEGAL_ACTION` / `NOT_YOUR_TURN` / `GAME_OVER` / `BAD_MESSAGE` |

### GameStateView（schemas.py）

引擎 `GameState.to_dict()` 的公开视图：展台、中央池（含先手标记）、双方玩家板全量、比分、当前玩家、轮数、袋与弃料盒**各色计数**（公开信息，前端可显示剩余料统计）。颜色以字符串名序列化（`"blue"` 等）；动作同时携带 `action_id` 与展开字段。

## 3. GameManager（app/game_manager.py）

```python
class GameSession:
    game: QuadroGame
    mode: Mode
    agents: dict[int, Agent]         # pve: {1: agent}; eve: {0:…, 1:…}
    sockets: set[WebSocket]
    lock: asyncio.Lock               # 串行化本局所有动作
    log: list[dict]                  # 动作与事件日志
    eve_playing: bool; eve_interval: float
```

关键行为：

1. **人类动作**：`async with lock` → 校验合法（引擎 `legal_actions` 包含性检查）→ `game.step` → 追加日志 → 广播 state+events → 若轮到 AI，调度 AI 任务。
2. **AI 执行**：`await loop.run_in_executor(pool, agent.choose, ...)`——搜索是 CPU 密集，**绝不能阻塞事件循环**。`ThreadPoolExecutor(max_workers=2)`（GIL 下 AI 单线程跑即可，executor 只为不阻塞 asyncio）。AI 落子后同样广播；若下一手仍是 AI（EvE），按 `eve_interval` sleep 后继续，直到 pause 或终局。
3. **连接管理**：新 socket 接入即发全量 state；断开仅移出集合，游戏不受影响——刷新页面重连即恢复，这就是天然的"断线恢复"，无需额外机制。

### 错误与边界

- 非法动作：不改状态，回 `error` 并重发 `legal_actions`。
- 对局不存在/已结束：REST 404 / WS `error(GAME_OVER)`。
- **AI 异常：捕获后降级为随机合法动作 + 服务端告警日志**（对局不能因 AI bug 卡死）。
- 消息解析失败：回 `error(BAD_MESSAGE)`，连接不断开。

## 4. 最小 Web 客户端（frontend/）

技术选型：**Vite + React 18 + TypeScript + Tailwind**（不用 Next.js，纯客户端 SPA 无 SSR 需求）。状态用单一 `useGame` hook 封装 WebSocket，不引入 Redux/Zustand——状态源在服务端，前端只是视图 + 待发交互。

### 4.1 本阶段的组件（极简）

```
App
├── SetupScreen      # 一个下拉（模式/难度）+ 开始按钮
└── GameScreen
    ├── TopBar       # 轮数、当前行动方、比分
    ├── DisplayArea  # 5 展台 + 中央池，纯方块，点击选中
    └── PlayerBoard ×2   # 备料行 + 网格 + 罚分行，无动画
```

样式要求只有一条：**信息完整、点得准**。配色用最终色板（见 04 号计划），但不做圆角阴影动效。

### 4.2 两步交互（核心手感，本阶段就要做对）

```
idle ──点击某来源某色──> picked{source, color}
picked ──点击合法备料行/罚分行──> 发送 action，回 idle（等服务端 state）
picked ──点击同来源同色──> 取消回 idle
picked ──点击其他来源/颜色──> 切换选中
```

- 选中态：同色组描边高亮。
- 合法目标行高亮，非法置灰。**判定全部基于服务端下发的 `legal_actions` 集合**（`Set<action_id>`，O(1) 查），前端不实现任何规则。
- 落点预览（放几块/溢出几块/罚分变化）留到 P4；P2 只要能提交合法动作。

### 4.3 useGame hook

```ts
const { state, events, legalActions, error, sendAction, connect } = useGame(gameId);
```

管理 WS 生命周期：连接、消息分发、断开后指数退避重连 + `resync`。

### 4.4 类型对接

手写 `types/game.ts` 镜像 `schemas.py`（`GameStateView`, `Event`, `Action`, 消息联合类型）。协议变更时**先改后端再同步 TS**。（openapi→ts 代码生成是可选优化，MVP 手写。）

## 5. 测试

**后端**（`tests/test_app.py`，httpx + FastAPI TestClient）：
1. 创建 pve 对局并用脚本扮演人类随机走子打完整局。
2. 非法动作被拒且状态不变；AI 思考期间抢发动作返回 `NOT_YOUR_TURN`。
3. 两个 socket 同时连接收到一致广播；断开重连后 resync 状态一致。
4. `/log` 导出后用引擎重放，最终状态与服务端一致。

**前端**：本阶段只做手动验证，组件测试留给 P4。

## 6. 实施顺序

| Day | 内容 |
|-----|------|
| 4 | schemas + GameManager + REST + WS 骨架；用 Python 脚本客户端跑通 pve 全局；写 protocol.md |
| 5 | 前端脚手架 + types + useGame + 静态渲染（先用 GET 快照渲染，不接交互） |
| 6 | 两步交互 + legal_actions 高亮 + 提交动作 + 错误提示；**浏览器里打完一局** |

## 7. 出口条件

- [ ] 后端测试全绿；协议文档 `docs/protocol.md` 与 schemas.py 一致
- [ ] **你在浏览器里完整打完一局 PvE（对手 Random）**，全程无卡死、无状态错乱
- [ ] 刷新页面后对局状态正确恢复
- [ ] 点击非法目标有明确反馈，且不改变服务端状态
