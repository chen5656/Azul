import type { GameStateView } from "../types/game";
import { COLORS } from "../types/game";

export function TopBar({
  state,
  thinking,
  connected,
  onNewGame,
}: {
  state: GameStateView;
  thinking: number | null;
  connected: boolean;
  onNewGame: () => void;
}) {
  const bag = COLORS.reduce((a, c) => a + (state.bag[c] ?? 0), 0);
  const discard = COLORS.reduce((a, c) => a + (state.discard[c] ?? 0), 0);
  const turn = state.result
    ? "对局结束"
    : thinking !== null
      ? `P${thinking} 思考中…`
      : `P${state.current} 行动`;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-neutral-700 pb-2 text-sm">
      <span className="font-semibold">第 {state.round_num} 轮</span>
      <span>{turn}</span>
      <span className="tabular-nums">
        比分 {state.players[0].score} : {state.players[1].score}
      </span>
      <span className="text-neutral-400">
        袋 {bag} · 弃料 {discard}
      </span>
      <span className={connected ? "text-emerald-400" : "text-amber-400"}>
        {connected ? "已连接" : "重连中…"}
      </span>
      <button
        onClick={onNewGame}
        className="ml-auto rounded border border-neutral-600 px-2 py-1 hover:bg-neutral-700"
      >
        新对局
      </button>
    </div>
  );
}
