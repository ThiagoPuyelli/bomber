import { LogIn } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';

interface JoinGameFormProps {
  codeHint: string;
  loading: boolean;
  onJoin: (code: string) => Promise<void>;
}

export function JoinGameForm({
  codeHint,
  loading,
  onJoin,
}: JoinGameFormProps): JSX.Element {
  const [code, setCode] = useState(codeHint);

  useEffect(() => {
    setCode(codeHint);
  }, [codeHint]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!code.trim()) {
      return;
    }

    await onJoin(code);
  }

  return (
    <form className="panel form-panel form-reveal" onSubmit={handleSubmit}>
      <div>
        <h2>Unirse a una sala</h2>
        <p>Ingresa el codigo de la sala. Tu username aparecerá en la partida.</p>
      </div>

      <label className="field">
        <span>Codigo</span>
        <input
          type="text"
          value={code}
          maxLength={6}
          placeholder="ABC123"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </label>

      <button className="button secondary" type="submit" disabled={loading}>
        <LogIn size={18} aria-hidden="true" />
        Unirse a la sala
      </button>
    </form>
  );
}
