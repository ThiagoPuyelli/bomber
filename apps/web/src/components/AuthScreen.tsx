import { Bomb, LogIn, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface AuthScreenProps {
  loading: boolean;
  error: string | null;
  onLogin: (login: string, password: string) => Promise<void>;
  onRegister: (username: string, email: string, password: string) => Promise<void>;
}

export function AuthScreen({
  loading,
  error,
  onLogin,
  onRegister,
}: AuthScreenProps): JSX.Element {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (registering) {
      await onRegister(username, email, password);
    } else {
      await onLogin(login, password);
    }
  }

  return (
    <main className="screen home-screen auth-screen">
      <header className="home-hero">
        <div className="hero-emblem" aria-hidden="true"><Bomb size={42} strokeWidth={2.4} /></div>
        <p className="hero-kicker">Arcade 1v1 · Cuenta de jugador</p>
        <h1 className="hero-title">BOMBER <span className="title-accent">REAL</span></h1>
        <p className="hero-subtitle">Iniciá sesión o registrate para jugar y guardar tu historial.</p>
      </header>

      <form className="panel form-panel auth-form" onSubmit={(event) => void submit(event)}>
        <div>
          <h2>{registering ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p>{registering ? 'Elegí tu username, correo y contraseña.' : 'Usá tu username o correo para entrar.'}</p>
        </div>

        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        {registering ? (
          <>
            <label className="field">
              <span>Username</span>
              <input required autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="field">
              <span>Correo</span>
              <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          </>
        ) : (
          <label className="field">
            <span>Username o correo</span>
            <input required autoComplete="username" maxLength={254} value={login} onChange={(event) => setLogin(event.target.value)} />
          </label>
        )}

        <label className="field">
          <span>Contraseña {registering ? '(mínimo 12 caracteres)' : ''}</span>
          <input required type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>

        <button className="button primary" type="submit" disabled={loading}>
          {registering ? <UserPlus size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
          {loading ? 'Un momento…' : registering ? 'Crear cuenta' : 'Entrar'}
        </button>
        <button className="auth-mode-toggle" type="button" onClick={() => setRegistering((value) => !value)}>
          {registering ? 'Ya tengo una cuenta' : 'Crear una cuenta nueva'}
        </button>
      </form>
    </main>
  );
}
