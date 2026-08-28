import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionView,
  ClientMessage,
  Color,
  GameEvent,
  GameStateView,
  ServerMessage,
} from "../types/game";

export interface GameError {
  code: string;
  message: string;
  at: number;
}

const MAX_BACKOFF = 8000;

/**
 * Owns the WebSocket for one game. The server is the only source of truth: this
 * hook never derives rules, it just mirrors what arrives and posts intents back.
 */
export function useGame(gameId: string | null) {
  const [state, setState] = useState<GameStateView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [legalActions, setLegalActions] = useState<Set<number>>(new Set());
  const [legalDetail, setLegalDetail] = useState<ActionView[]>([]);
  const [thinking, setThinking] = useState<number | null>(null);
  const [error, setError] = useState<GameError | null>(null);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!gameId) return;
    closedRef.current = false;

    const open = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/games/${gameId}`);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
        ws.send(JSON.stringify({ type: "resync" } satisfies ClientMessage));
      };

      ws.onmessage = (ev) => {
        const msg: ServerMessage = JSON.parse(ev.data);
        switch (msg.type) {
          case "state": {
            const { type: _t, ...view } = msg;
            setState(view as GameStateView);
            setThinking(null);
            break;
          }
          case "events":
            setEvents((prev) => [...prev, ...msg.events]);
            break;
          case "legal_actions":
            setLegalActions(new Set(msg.actions));
            setLegalDetail(msg.detail);
            break;
          case "ai_thinking":
            setThinking(msg.player);
            break;
          case "error":
            setError({ code: msg.code, message: msg.message, at: Date.now() });
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (closedRef.current) return;
        // Exponential backoff; every reconnect resyncs, so no state is lost.
        const delay = Math.min(MAX_BACKOFF, 500 * 2 ** retryRef.current++);
        timerRef.current = window.setTimeout(open, delay);
      };
    };

    open();
    return () => {
      closedRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [gameId]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const sendAction = useCallback(
    (source: number, color: Color, dest: number) => {
      setError(null);
      send({ type: "action", source, color, dest });
    },
    [send]
  );

  const resync = useCallback(() => send({ type: "resync" }), [send]);

  return { state, events, legalActions, legalDetail, thinking, error, connected, sendAction, resync };
}
