# Bomber Real

Base de proyecto en TypeScript para un juego con:

- API REST en NestJS.
- WebSockets con Socket.IO.
- Frontend en React + TypeScript.
- Redis para partidas pendientes/en curso.
- PostgreSQL para historial de partidas y mensajes.

## Estructura

```txt
apps/
  api/    Backend NestJS, REST, WebSocket, Redis y PostgreSQL.
  web/    Frontend React para crear/unirse/iniciar partidas y chatear.
```

## Puesta en marcha

```bash
cp .env.example .env
# Configura JWT_SECRET con un secreto aleatorio (por ejemplo: openssl rand -base64 32)
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Servicios por defecto:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Flujo implementado

1. Cada jugador se registra o inicia sesión con su username/correo y contraseña.
2. Un jugador crea una partida y queda como anfitrión.
3. Se genera un código corto y el segundo jugador se une con ese código.
4. El anfitrión inicia la partida.
5. Ambos entran al juego y al chat WebSocket con la identidad de su cuenta.
6. Los mensajes y el historial quedan asociados a los usuarios participantes.

## Endpoints principales

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`

- `POST /games`
- `GET /games/pending`
- `GET /games/:code`
- `POST /games/:code/join`
- `POST /games/:code/start`
- `GET /history`
- `GET /history/:code`

Las contraseñas se almacenan como derivaciones scrypt. La API firma JWT de acceso
HS256 de una hora y los entrega mediante una cookie `HttpOnly`, `SameSite=Strict`
y `Secure` fuera de desarrollo. Al vencer, hay que iniciar sesión otra vez.
Configura `JWT_SECRET` con al menos 32 bytes aleatorios
y no lo publiques ni lo incluyas en el frontend. El historial requiere sesión y
solo devuelve partidas en las que participó la cuenta autenticada.
