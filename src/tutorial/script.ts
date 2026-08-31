/**
 * The scripted lesson: one full round of Quadro, move by move.
 *
 * The whole lesson is deterministic. Seed 7 deals the opening below, the
 * opponent is the greedy agent (synchronous, seeded, <5ms), and the learner's
 * six moves are fixed — so every line of coaching text can name concrete tiles
 * and concrete numbers and still be true. `test/ui/tutorial-script.test.ts`
 * replays the whole script against the engine to keep it that way.
 *
 * Round 1 of seed 7:
 *   F1: BB K W   F2: Y RRR   F3: B Y R K   F4: B Y R K   F5: YY R W
 */

import { BLACK, CENTER, RED, WHITE, YELLOW } from '../engine';

/** The deal the lesson is written against. Changing it invalidates every step. */
export const TUTORIAL_SEED = 7;
/** The human always leads, so step 1 is the very first move of the game. */
export const TUTORIAL_FIRST_PLAYER = 0;
export const TUTORIAL_HUMAN_SEAT = 0;
export const OPPONENT_LABEL = 'Coach';

/**
 * What to ring on the board while a step is open. `source` indexes a factory
 * (0..4) or the center; `row` a staging row; `floor` the penalty row.
 */
export type Spotlight =
  | { kind: 'source'; index: number }
  | { kind: 'row'; index: number }
  | { kind: 'floor' }
  | { kind: 'wall' };

/** A step with nothing to click: read it, press Next. */
export interface TalkStep {
  kind: 'talk';
  title: string;
  body: string[];
  spotlight?: Spotlight;
}

/**
 * A step the learner plays. `source`/`color`/`dest` are the only move the board
 * will accept while the step is open, which is what makes the coaching exact.
 */
export interface MoveStep {
  kind: 'move';
  title: string;
  source: number;
  color: number;
  dest: number;
  /** Shown until the learner has picked the group. */
  pick: string[];
  /** Shown once the group is picked, until it is placed. */
  place: string[];
  /** Shown after the move has landed and the opponent has answered. */
  after: string[];
}

export type Step = TalkStep | MoveStep;

export const STEPS: Step[] = [
  {
    kind: 'talk',
    title: 'The table',
    body: [
      'Five factories hold four tiles each, and the center starts empty. Everything you can see is everything there is — no hidden hands, no hidden bag order.',
      'Your board is on the left below, the opponent’s on the right. You will play one full round together, then read the score.',
    ],
    spotlight: { kind: 'source', index: 1 },
  },
  {
    kind: 'move',
    title: 'Take a whole color',
    source: 1,
    color: RED,
    dest: 2,
    pick: [
      'A turn is always the same two clicks: take, then place.',
      'You never take one tile — you take every tile of one color from one factory. Factory 2 holds three reds. Click them.',
    ],
    place: [
      'Now pick a home for them. The five rows on the left of your board are pattern lines, holding 1, 2, 3, 4 and 5 tiles.',
      'Three reds fit row 3 exactly. Click row 3.',
    ],
    after: [
      'Row 3 is full — at the end of the round it will move onto your wall and score.',
      'Look at the center. The yellow you left in factory 2 slid there, and so did the black and white the opponent left behind in factory 1 — a factory empties completely the moment anyone takes from it.',
    ],
  },
  {
    kind: 'move',
    title: 'The center, and the token',
    source: CENTER,
    color: YELLOW,
    dest: 1,
    pick: [
      'The center is a sixth source, and it grows all round as players spill leftovers into it.',
      'Take the yellow from the center.',
    ],
    place: [
      'Put it on row 2. One of the two slots fills; the row stays open for another yellow later.',
    ],
    after: [
      'You also picked up the “1” marker — the first player to take from the center each round always does.',
      'It cost you a slot on your floor line, worth −1 point. In exchange you lead the next round, which is worth having when one color is running short.',
    ],
  },
  {
    kind: 'move',
    title: 'Overflow',
    source: 4,
    color: YELLOW,
    dest: 1,
    pick: [
      'Factory 5 has two yellows and row 2 has one free slot. You must still take both.',
      'Take the yellows from factory 5.',
    ],
    place: [
      'Place them on row 2. Watch what the row does with the tile it cannot hold.',
    ],
    after: [
      'One yellow completed row 2. The other had nowhere to go and dropped onto the floor line, which now reads −2.',
      'This is the trade you make all game: a completed line is worth points, and overflow is worth negative points. Here it was worth it — row 2 will score, and the floor resets every round.',
    ],
  },
  {
    kind: 'move',
    title: 'Lines can wait',
    source: CENTER,
    color: WHITE,
    dest: 4,
    pick: ['Take the two whites out of the center.'],
    place: [
      'Send them to row 5, which holds five. Two of five is fine — an unfinished line is not a penalty, it just sits there.',
    ],
    after: [
      'Row 5 keeps its two whites into the next round, and only whites may be added to it until it settles.',
      'That is the long game: wide rows take several rounds to fill, and the opponent can see you need whites.',
    ],
  },
  {
    kind: 'move',
    title: 'Feeding the center',
    source: 2,
    color: BLACK,
    dest: 3,
    pick: ['Factory 3 is the last one with tiles. Take its black tile.'],
    place: ['Row 4 is empty and holds four. Start it with the black.'],
    after: [
      'One black to you, and the blue, yellow and red you left behind all poured into the center — where the opponent immediately helped itself.',
      'Taking a single tile off a full factory hands the other three to your opponent. Sometimes that is the price; sometimes it is the reason to take a different factory.',
    ],
  },
  {
    kind: 'move',
    title: 'The last tiles',
    source: CENTER,
    color: YELLOW,
    dest: 0,
    pick: [
      'Two tiles are left in the whole round, one yellow and one red. When they are gone the round settles.',
      'Take the yellow.',
    ],
    place: ['Row 1 holds exactly one tile. The yellow completes it.'],
    after: [
      'The round ended: every completed line moved onto your wall, and the floor line charged you for what it held.',
      'You finished three lines and still trail 1–3. The −2 floor ate most of your round. That is the lesson worth keeping.',
    ],
  },
  {
    kind: 'talk',
    title: 'How the wall scores',
    spotlight: { kind: 'wall' },
    body: [
      'A settled tile scores 1 on its own. But it scores the length of every unbroken run it joins — horizontal, vertical, or both — so tiles placed next to your existing tiles are worth far more than tiles placed in empty space.',
      'You settled three lines into three separate corners of your wall: 1 + 1 + 1 = 3, then −2 for the floor. The opponent settled only two lines but stacked them in one column, so its second tile scored 2 instead of 1 — 3 points from less drafting.',
      'Each color sits in a fixed column on every row, which is why a pattern line can only ever settle in one place — and why a row that already holds a color refuses more of it.',
    ],
  },
  {
    kind: 'talk',
    title: 'How the game ends',
    body: [
      'The game ends the moment anyone completes a full horizontal row on their wall. Then the bonuses land: +2 for each complete row, +7 for each complete column, +10 for collecting all five tiles of one color.',
      'A single column is worth more than three completed rows of drafting, so the endgame is usually a race to set up bonuses rather than to fill lines fast.',
    ],
  },
  {
    kind: 'talk',
    title: 'That’s the game',
    body: [
      'Take a color, place it, live with the overflow, and count the floor line before you commit.',
      'Practice is untimed and unrecorded, against any of four opponents. The Daily is one deal shared by everybody, scored on your winning margin.',
    ],
  },
];

/** Every move the learner makes, in order. Used by the script test. */
export const MOVE_STEPS = STEPS.filter((s): s is MoveStep => s.kind === 'move');
