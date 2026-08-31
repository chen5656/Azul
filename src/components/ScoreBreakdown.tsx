import type { PlayerBoard } from '../engine';

export function ScoreBreakdown({
  board,
  tone = 'sky',
  title = 'Endgame Bonuses',
}: {
  board: PlayerBoard;
  tone?: 'sky' | 'rose';
  title?: string;
}) {
  const rows = board.completeRows();
  const cols = board.completeColumns();
  const colors = board.completeColors();

  const headingColor = tone === 'rose' ? 'text-rose-400' : 'text-sky-400';

  return (
    <div className="flex flex-col justify-between rounded-xl border border-neutral-700/60 bg-neutral-900/60 p-2.5 sm:p-3 shadow-sm backdrop-blur-sm">
      <h3 className={`text-xs font-semibold uppercase tracking-wider ${headingColor}`}>
        {title}
      </h3>

      <div className="mt-1.5 flex flex-col gap-1 text-xs text-neutral-300">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Completed Rows</span>
          <span className="font-medium tabular-nums text-neutral-200">
            {rows}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Completed Columns</span>
          <span className="font-medium tabular-nums text-neutral-200">
            {cols}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">Color Variety</span>
          <span className="font-medium tabular-nums text-neutral-200">
            {colors}
          </span>
        </div>
      </div>
    </div>
  );
}
