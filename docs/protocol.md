# Quadro 通信协议（v1）

> 唯一事实来源是 `backend/app/schemas.py`；本文由其整理而成。**协议变更时先改 schemas.py，再同步本文与 `frontend/src/types/game.ts`。**

约定：

- 颜色以字符串序列化：`"blue" | "yellow" | "red" | "black" | "white"`。
- `source`：`0..4` 为展台，`5` 为中央池。
- `dest`：`0..4` 为备料行（容量 1..5），`5` 为整组弃入罚分行。
- `action_id = (source * 5 + color) * 6 + dest`，取值 `0..179`。
- 服务端是状态的唯一权威；前端不实现任何规则判定。

## 1. REST

| 方法 | 路径 | 请求 | 响应 |
|------|------|------|------|
| POST | `/api/games` | `{mode, ai0?, ai1?, seed?}` | `{game_id}` |
| GET | `/api/games/{id}` | — | `GameStateView` |
| GET | `/api/games/{id}/log` | — | 回放记录（见 §4） |
| DELETE | `/api/games/{id}` | — | `{ok: true}` |

`mode`: `"pvp" | "pve" | "eve"`；`ai0`/`ai1`: `"random" | "greedy" | "minimax" | "mcts"`。

- `pve`：人类固定为 player 0，AI 为 player 1（`ai1`）。
- `eve`：双方均为 AI，创建后自动开始播放。
- P2 只实现 Level 0（`random`）；其余等级名已在协议中定型，P3 落地时前端无需改动——`make_agent` 暂时对未实现等级回退到 random。
- 对局存于内存，**1 小时无活动自动回收**；对局不存在返回 404。

## 2. WebSocket `/ws/games/{id}`

连接建立后服务端立即推送 `state` + `legal_actions`。所有消息为 JSON 对象，带 `type` 字段。

### 客户端 → 服务端

| type | payload | 说明 |
|------|---------|------|
| `action` | `{source: int, color: string, dest: int}` | 提交动作；行动方由服务端按 `state.current` 认定 |
| `eve_control` | `{command: "play"\|"pause"\|"step", interval_ms?: int}` | EvE 播放控制 |
| `resync` | `{}` | 请求全量状态重发 |

### 服务端 → 客户端

| type | payload | 说明 |
|------|---------|------|
| `state` | `GameStateView` 全量展开 | 每次动作后推送 |
| `events` | `{events: Event[]}` | 与 `state` 同批推送的引擎事件流 |
| `legal_actions` | `{actions: int[], detail: Action[]}` | 轮到人类时为完整合法动作集；轮到 AI 或已终局时为空数组 |
| `ai_thinking` | `{player: int, level: string}` | AI 开始计算 |
| `error` | `{code, message}` | 见下表 |

`error.code`：

| code | 触发 |
|------|------|
| `ILLEGAL_ACTION` | 动作不在合法集合中；状态不变，随后补发 `legal_actions` |
| `NOT_YOUR_TURN` | 轮到 AI 时人类抢发动作 |
| `GAME_OVER` | 对局已结束或不存在 |
| `BAD_MESSAGE` | 消息无法解析；**连接不断开** |

## 3. GameStateView

```jsonc
{
  "game_id": "a1b2c3d4e5f6",
  "mode": "pve",
  "displays": [{"blue": 2, "red": 1}, ...],   // 5 个展台，空色不出现
  "center": {"white": 3},
  "center_has_token": true,                    // 先手标记是否仍在中央池
  "bag": {"blue": 17, ...},                    // 各色计数，公开信息
  "discard": {"blue": 0, ...},
  "players": [PlayerView, PlayerView],
  "current": 0,                                // 当前行动方
  "first_player": 0,                           // 本轮先手
  "round_num": 1,
  "phase": "drafting" | "game_over",
  "agents": {"1": "random"},                   // 玩家序号(字符串) → AI 等级
  "result": ResultView | null                  // 仅终局后非空
}
```

`PlayerView`：

```jsonc
{
  "staging_colors": [null, "blue", ...],  // 5 行，null 表示空行
  "staging_counts": [0, 2, ...],
  "grid": [[false, ...], ...],            // 5×5 布尔；色位固定为 (c - r + 5) % 5
  "penalty_tiles": ["first_token", "red"],// 按落入顺序，最多 7 个
  "penalty_overflow": 0,                  // 溢出到弃料盒的方块数（不计分）
  "score": 12,
  "has_first_token": false
}
```

`ResultView`：`{scores: int[], winner: int|null, draw: bool, complete_rows: int[], rounds: int}`。

## 4. 事件与回放记录

事件为引擎 `Event.to_dict()`，以 `kind` 区分：`draft` / `tile_scored` / `penalty` / `round_end` / `round_start` / `bonus` / `game_end`，字段见 `backend/engine/events.py`。

`GET /api/games/{id}/log` 返回：

```jsonc
{
  "version": 1,
  "seed": 12345,
  "mode": "pve",
  "players": [{"kind": "human"}, {"kind": "ai", "level": "random"}],
  "actions": [{"source": 0, "color": "blue", "dest": 1, "action_id": 6}, ...],
  "events": [{"action": {...}, "events": [...]}, ...],
  "final": ResultView | null
}
```

同一 `seed` + `actions` 序列可由 `QuadroGame.from_log()` 精确重放（后端测试 `test_log_export_replays_to_the_same_state` 逐局校验）。

## 5. 断线恢复

服务端不为连接保存任何状态：断开只是把 socket 移出广播集合，对局照常存在。**刷新页面重连即恢复**——新连接会立刻收到全量 `state` 与 `legal_actions`；若怀疑不同步，随时发 `resync`。
