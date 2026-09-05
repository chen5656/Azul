/**
 * The scripted lesson: one full round of Quadro, move by move.
 *
 * The whole lesson is deterministic. Seed 7 deals the opening below, the
 * opponent is the greedy agent (synchronous, seeded, <5ms), and the learner's
 * six moves are fixed — so every line of coaching text can name concrete tokens
 * and concrete numbers and still be true. `test/ui/tutorial-script.test.ts`
 * replays the whole script against the engine to keep it that way.
 *
 * Round 1 of seed 7:
 *   A1: BB K W   A2: Y RRR   A3: B Y R K   A4: B Y R K   A5: YY R W
 */

import { CENTER, GREEN, RED, WHITE, YELLOW } from '../engine';

/** The deal the lesson is written against. Changing it invalidates every step. */
export const TUTORIAL_SEED = 7;
/** The human always leads, so step 1 is the very first move of the game. */
export const TUTORIAL_FIRST_PLAYER = 0;
export const TUTORIAL_HUMAN_SEAT = 0;
/**
 * The greedy opponent's seed. It only ever breaks ties between equally valued
 * replies, but those ties decide the exact line the lesson text describes, so
 * it is pinned here next to the deal rather than derived somewhere else — the
 * script test replays the whole round against it.
 */
export const TUTORIAL_OPPONENT_SEED = 4;
export const OPPONENT_LABEL = 'Coach';

/**
 * What to ring on the board while a step is open. `source` indexes an attention
 * node (0..4) or the buffer; `row` a context line; `floor` the hallucination row.
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
    title: 'The neural interface',
    body: [
      'Five attention nodes hold four memory tokens each, and the buffer starts empty. Everything you can see is everything there is — no hidden hands, no hidden data.',
      'Your consciousness board is on the left below, the AI opponent’s on the right. You will play one full round together, then read the score.',
    ],
    spotlight: { kind: 'source', index: 1 },
  },
  {
    kind: 'move',
    title: 'Focus on a whole frequency',
    source: 1,
    color: RED,
    dest: 2,
    pick: [
      'A turn is always the same two clicks: focus, then align.',
      'You never take a single token — you extract every token of one color from an attention node. Attention 2 holds three reds. Click them.',
    ],
    place: [
      'Now pick a home for them. The five rows on the left of your board are context lines, holding 1, 2, 3, 4 and 5 tokens.',
      'Three reds fit context line 3 exactly. Click row 3.',
    ],
    after: [
      'Context line 3 is full — at the end of the round it will crystallize into permanent memory and score.',
      'Look at the buffer. The yellow you left in Attention 2 slid there, and so did the green and white the AI left behind in Attention 1 — an attention node clears completely the moment anyone draws from it.',
    ],
  },
  {
    kind: 'move',
    title: 'The buffer and initiative',
    source: CENTER,
    color: YELLOW,
    dest: 1,
    pick: [
      'The buffer is a sixth source, and it grows all round as unattended tokens drift into it.',
      'Take the yellow token from the buffer.',
    ],
    place: [
      'Put it on context line 2. One of the two slots fills; the row stays open for another yellow later.',
    ],
    after: [
      'You also picked up the initiative (“1”) marker — the first to draw from the buffer each round always does.',
      'It costs one slot on your hallucination line, inflicting a −1 penalty. In exchange you lead the next round, which is vital when a memory color is running short.',
    ],
  },
  {
    kind: 'move',
    title: 'Cognitive overflow',
    source: 4,
    color: YELLOW,
    dest: 1,
    pick: [
      'Attention 5 has two yellows and context line 2 has one free slot. You must still take both.',
      'Take the yellows from Attention 5.',
    ],
    place: [
      'Place them on context line 2. Watch what happens to the token your context cannot hold.',
    ],
    after: [
      'One yellow completed context line 2. The other had nowhere to go and dropped onto your hallucination line, which now reads −2.',
      'This is the trade you make all game: a completed line crystallizes into memory, while overflow causes hallucination penalties. Here it was worth it — line 2 will score, and hallucinations reset every round.',
    ],
  },
  {
    kind: 'move',
    title: 'Context lines can wait',
    source: CENTER,
    color: WHITE,
    dest: 4,
    pick: ['Take the two whites out of the buffer.'],
    place: [
      'Send them to context line 5, which holds five tokens. Two of five is fine — an unfinished line is not penalized, it just waits.',
    ],
    after: [
      'Line 5 keeps its two whites into the next round, and only whites may be added to it until it settles.',
      'That is the long game: wide context lines take several rounds to align, and the AI can see you need whites.',
    ],
  },
  {
    kind: 'move',
    title: 'Feeding the buffer',
    source: 2,
    color: GREEN,
    dest: 3,
    pick: ['Attention 3 is the last node with tokens. Take its green token.'],
    place: ['Context line 4 is empty and holds four. Start it with the green.'],
    after: [
      'One green to you, and the blue, yellow and red you left behind all poured into the buffer — where the AI immediately helped itself.',
      'Taking a single token off a full attention node hands the other three to your opponent in the buffer. Sometimes that is the price; sometimes it is the reason to focus elsewhere.',
    ],
  },
  {
    kind: 'move',
    title: 'The final tokens',
    source: CENTER,
    color: YELLOW,
    dest: 0,
    pick: [
      'Two tokens are left in the whole round, one yellow and one red. When they are gone the round settles.',
      'Take the yellow token.',
    ],
    place: ['Context line 1 holds exactly one token. The yellow completes it.'],
    after: [
      'The round ended: every completed context line crystallized into your memory grid, and the hallucination line penalized you for what it held.',
      'You finished three lines and still trail 1–3. The −2 hallucination ate most of your round score. That is the lesson worth keeping.',
    ],
  },
  {
    kind: 'talk',
    title: 'How memory scores',
    spotlight: { kind: 'wall' },
    body: [
      'A crystallized token scores 1 on its own. But it scores the length of every unbroken cluster it joins — horizontal, vertical, or both — so tokens placed adjacent to existing memory nodes are worth far more.',
      'You settled three lines into three separate corners of your memory: 1 + 1 + 1 = 3, then −2 for hallucinations. The AI settled only two lines but stacked them in one column, scoring 2 instead of 1 on the second token.',
      'Each color sits in a fixed column on every row, which is why a context line can only settle into one place — and why a row that already holds a color refuses more of it.',
    ],
  },
  {
    kind: 'talk',
    title: 'Convergence and endgame',
    body: [
      'The duel ends the moment either side completes a full horizontal row in memory. Then convergence bonuses land: +2 for each complete row, +7 for each complete column, +10 for collecting all five tokens of one color.',
      'A single column is worth more than three completed rows of drafting, so the endgame is usually a race for column bonuses rather than fast row fills.',
    ],
  },
  {
    kind: 'talk',
    title: 'That’s the game',
    body: [
      'Focus attention, align your context, manage hallucinations, and calculate penalties before you commit.',
      'Practice is untimed and unrecorded, against any AI difficulty. The Daily Challenge is one shared puzzle for everyone, scored on your winning margin.',
    ],
  },
];

/** Every move the learner makes, in order. Used by the script test. */
export const MOVE_STEPS = STEPS.filter((s): s is MoveStep => s.kind === 'move');
