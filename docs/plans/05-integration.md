# 模块计划 05 — 联调、回放与最终验收（Day 13-14）

## 1. 对局记录与回放

**格式**（`/api/games/{id}/log` 导出，也可由 CLI 的 `save` 命令产出；用 JSON，不用 PGN 样式——自定义文本格式对本项目无增益）：

```json
{
  "version": 1,
  "seed": 42,
  "mode": "pve",
  "players": [{"kind": "human"}, {"kind": "ai", "level": "mcts"}],
  "actions": [{"player": 0, "source": 2, "color": 1, "dest": 3}, ...],
  "final": {"scores": [61, 54], "winner": 0}
}
```

**回放校验器**（`scripts/replay.py`）：读取记录，从 seed 重建引擎逐动作重放，断言每步合法且终局分数与记录一致。这是引擎确定性的最终证明，也是回归测试素材——把有价值的对局（触发过罕见分支的）存入 `tests/fixtures/` 作为固化用例。

CLI 已支持 `--replay game.json` 逐步观看重放（Day 3 交付）。**前端回放播放器**为可选扩展（复用 EvE 的 step/play 控制），不在 MVP。

## 2. 联调清单

1. 两条命令起全栈（`uvicorn app.main:app --reload` + `npm run dev`）；README 写清步骤与端口。
2. 三模式端到端人工走查（对照 04 号计划出口条件）。
3. **性能走查**：PvE 下 MCTS 500ms 预算时 UI 无卡顿——用浏览器网络面板确认 `ai_thinking` → `state` 的间隔稳定在预算附近，且期间其他消息（如 resync）仍能响应，证明事件循环未被阻塞。
4. 全套自动化聚合成一条命令：`pytest`（engine + ai + app）+ 前端 Vitest + 1 条 Playwright 冒烟，写入 `Makefile` 与 CI workflow。

## 3. 最终验收标准

- [ ] 三种模式无缝切换，创建/结束/再来一局均正常
- [ ] AI 基准达标（03 号计划的胜率矩阵），结果落盘 `docs/ai_benchmarks.md`
- [ ] 任意一局可导出记录并通过 `replay.py` 校验
- [ ] engine 测试覆盖率 > 95%，全仓测试一条命令通过
- [ ] README：项目简介、架构图、术语表、启动方式、基准结果摘要
- [ ] 全仓检索确认无第三方桌游商标名残留（`grep -ri` 检查旧名与旧术语）

## 4. 已明确排除（可选扩展池）

联机房间与断线令牌、音效、3-4 人局、前端回放播放器、AI 自弈强化学习、置换表与根节点并行优化。任何一项都不阻塞验收。
