import { Plus } from 'lucide-react';
import { FormEvent } from 'react';

interface CreateGameFormProps {
  loading: boolean;
  onCreate: () => Promise<void>;
}

export function CreateGameForm({
  loading,
  onCreate,
}: CreateGameFormProps): JSX.Element {
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onCreate();
  }

  return (
    <form className="panel form-panel form-reveal" onSubmit={handleSubmit}>
      <div>
        <h2>Crear lobby</h2>
        <p>Genera un codigo, espera a tu rival y arrancan cuando este listo.</p>
      </div>

      <button className="button primary" type="submit" disabled={loading}>
        <Plus size={18} aria-hidden="true" />
        Crear lobby
      </button>
    </form>
  );
}
