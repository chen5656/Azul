import { useState } from "react";
import type { AiLevel, Mode } from "../types/game";

export function SetupScreen({
  onStart,
  busy,
  error,
}: {
  onStart: (opts: { mode: Mode; ai1: AiLevel; seed?: number }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<Mode>("pve");
  const [ai1, setAi1] = useState<AiLevel>("random");
  const [seed, setSeed] = useState("");

  return (
    <div className="mx-auto mt-24 w-full max-w-sm space-y-4 rounded-xl border border-neutral-700 p-6">
      <h1 className="text-2xl font-bold">Quadro</h1>
      <label className="block text-sm">
        模式
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 p-2"
        >
          <option value="pve">人机对战（你执 P0）</option>
          <option value="eve">AI 观战</option>
        </select>
      </label>
      <label className="block text-sm">
        AI 难度
        <select
          value={ai1}
          onChange={(e) => setAi1(e.target.value as AiLevel)}
          className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 p-2"
        >
          {/* P2 ships Level 0 only; the rest fall back to random until P3. */}
          <option value="random">随机（Level 0）</option>
        </select>
      </label>
      <label className="block text-sm">
        随机种子（可选）
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="留空则随机"
          className="mt-1 w-full rounded border border-neutral-600 bg-neutral-800 p-2"
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        disabled={busy}
        onClick={() =>
          onStart({ mode, ai1, seed: seed.trim() === "" ? undefined : Number(seed) })
        }
        className="w-full rounded bg-sky-600 p-2 font-semibold hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? "创建中…" : "开始"}
      </button>
    </div>
  );
}
