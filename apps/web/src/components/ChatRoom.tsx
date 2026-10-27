import { Send } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { GameChatMessage, GamePlayer, GameState } from '../types';

interface ChatRoomProps {
  game: GameState | null;
  player: GamePlayer | null;
  connected: boolean;
  messages: GameChatMessage[];
  socketError: string | null;
  onSendMessage: (content: string) => void;
}

export function ChatRoom({
  game,
  player,
  connected,
  messages,
  socketError,
  onSendMessage,
}: ChatRoomProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const chatEnabled = Boolean(game && player && game.status === 'started');

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!draft.trim() || !chatEnabled) {
      return;
    }

    onSendMessage(draft);
    setDraft('');
  }

  return (
    <section className="panel chat-panel" aria-labelledby="chat-title">
      <div className="panel-heading">
        <div>
          <h2 id="chat-title">Chat de partida</h2>
          <p>{connected ? 'Sala en linea' : 'Reconectando...'}</p>
        </div>
        <span className={connected ? 'status online' : 'status offline'} />
      </div>

      <div className="message-list" ref={messageListRef}>
        {!chatEnabled ? (
          <div className="empty-state">El chat se habilita cuando inicia la partida.</div>
        ) : messages.length === 0 ? (
          <div className="empty-state">Todavia no hay mensajes.</div>
        ) : (
          messages.map((message) => (
            <article
              className={
                message.playerId === player?.id ? 'message own' : 'message'
              }
              key={message.id}
            >
              <header>
                <strong>{message.playerName}</strong>
                <time dateTime={message.createdAt}>
                  {new Intl.DateTimeFormat('es', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(message.createdAt))}
                </time>
              </header>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      {socketError ? <p className="error-text">{socketError}</p> : null}

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          maxLength={300}
          placeholder="Mensaje"
          disabled={!chatEnabled}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="button primary"
          type="submit"
          disabled={!chatEnabled || !draft.trim()}
        >
          <Send size={18} aria-hidden="true" />
          Enviar
        </button>
      </form>
    </section>
  );
}
