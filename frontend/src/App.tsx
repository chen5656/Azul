import { useCallback, useEffect, useMemo, useState } from "react";
import { DisplayArea } from "./components/DisplayArea";
import type { Selection } from "./components/DisplayArea";
import { PlayerBoard } from "./components/PlayerBoard";
import { SetupScreen } from "./components/SetupScreen";
import { TopBar } from "./components/TopBar";
import { useGame } from "./hooks/useGame";
import { actionId, sourceLabel } from "./types/game";
import type { AiLevel, Color, Mode } from "./types/game";

const STORAGE_KEY = "quadro.game_id";

export default function App() {
  // Surviving a refresh is free: the game lives on the server, we only keep its id.
  const [gameId, setGameId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [creating, setCreating] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const { state, legalActions, thinking, error, connected, sendAction } = useGame(gameId);

  useEffect(() => {
    if (gameId) localStorage.setItem(STORAGE_KEY, gameId);
    else localStorage.removeItem(STORAGE_KEY);
  }, [gameId]);

  // A stale id in localStorage (server restarted, session reaped) must not stick.
  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/games/${gameId}`).then((r) => {
      if (r.status === 404) setGameId(null);
    });
  }, [gameId]);

  useEffect(() => setSelection(null), [state?.current, state?.round_num]);

  const start = useCallback(async (opts: { mode: Mode; ai1: AiLevel; seed?: number }) => {
    setCreating(true);
    setSetupError(null);
    try {
      const r = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: opts.mode, ai1: opts.ai1, seed: opts.seed ?? null }),
      });
      if (!r.ok) throw new Error(`创建失败：${r.status}`);
      setGameId((await r.json()).game_id);
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, []);

  /** Every legality question is answered by the server's action_id set. */
  const selectable = useCallback(
    (source: number, color: Color) =>
      Array.from({ length: 6 }, (_, dest) => actionId(source, color, dest)).some((id) =>
        legalActions.has(id)
      ),
    [legalActions]
  );

  const destAllowed = useMemo(() => {
    if (!selection) return null;
    return (dest: number) => legalActions.has(actionId(selection.source, selection.color, dest));
  }, [selection, legalActions]);

  const pick = (source: number, color: Color) => {
    setSelection((prev) =>
      prev && prev.source === source && prev.color === color ? null : { source, color }
    );
  };

  const drop = (dest: number) => {
    if (!selection || !destAllowed?.(dest)) return;
    sendAction(selection.source, selection.color, dest);
    setSelection(null);
  };

  if (!gameId || !state) {
    return (
      <div className="min-h-screen p-4">
        {gameId && !state ? (
          <p className="mt-24 text-center text-neutral-400">连接中…</p>
        ) : (
          <SetupScreen onStart={start} busy={creating} error={setupError} />
        )}
      </div>
    );
  }

  const humanTurn = !state.result && !(String(state.current) in state.agents);
  const label = (i: number) => (String(i) in state.agents ? `AI · ${state.agents[String(i)]}` : "你");

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-4 p-4">
      <TopBar
        state={state}
        thinking={thinking}
        connected={connected}
        onNewGame={() => {
          setGameId(null);
          setSelection(null);
        }}
      />

      {state.result && (
        <div className="rounded-lg border border-sky-500 bg-sky-950/50 p-3">
          {state.result.draw
            ? `平局，${state.result.scores.join(" : ")}`
            : `P${state.result.winner} 获胜，${state.result.scores.join(" : ")}`}
          （共 {state.result.rounds} 轮）
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500 bg-red-950/50 p-2 text-sm text-red-200">
          {error.code}：{error.message}
        </div>
      )}

      <DisplayArea
        state={state}
        selection={selection}
        selectable={(s, c) => humanTurn && selectable(s, c)}
        onPick={pick}
      />

      <p className="h-5 text-sm text-neutral-400">
        {state.result
          ? ""
          : !humanTurn
            ? "等待 AI…"
            : selection
              ? `已选：${sourceLabel(selection.source)} 的 ${selection.color} — 点击高亮的行放置`
              : "点击一组方块开始"}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {state.players.map((board, i) => (
          <PlayerBoard
            key={i}
            board={board}
            index={i}
            label={label(i)}
            active={state.current === i && !state.result}
            legalDest={humanTurn && state.current === i ? destAllowed : null}
            onDrop={drop}
          />
        ))}
      </div>
    </div>
  );
}
