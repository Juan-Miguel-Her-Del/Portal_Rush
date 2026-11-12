# Portal Rush: servidor público

Configuración preparada para ejecutar el juego completo (Express + Socket.IO + físicas Cannon), sin depender del computador anfitrión ni de Cloudflare Quick Tunnel.

## Render

1. Subir el contenido de este proyecto a un repositorio propio de GitHub. Puede ser privado si se autoriza a Render a leerlo.
2. En https://dashboard.render.com elegir **New > Blueprint**, conectar ese repositorio y revisar `render.yaml`.
3. Confirmar el servicio **Web Service / Node**, región **Virginia**, plan **Free**. No es un sitio estático.
4. Comando de construcción: `npm ci --omit=dev --no-audit --no-fund`.
5. Comando de inicio: `npm start`. Comprobación de salud: `/api/health`.
6. Al terminar, abrir la dirección `https://...onrender.com` que devuelve Render. Todos los jugadores deben usar esa misma dirección y el código de la misma sala.

El archivo `render.yaml` ya declara estas opciones. `PORT` lo proporciona Render; el servidor escucha en `0.0.0.0` y usa esa variable. Three.js y todos los modelos, sonidos y texturas se sirven desde el propio servicio.

## Una única instancia

Mantener una instancia del servidor: las salas se guardan en memoria y no hay un adaptador compartido entre réplicas. Reiniciar o desplegar una versión vacía las salas y las puntuaciones. No hacen falta base de datos ni secretos para jugar.

## Límite del plan gratuito

Render puede suspender el servicio tras 15 minutos sin tráfico entrante; el primer acceso puede tardar alrededor de un minuto en despertarlo. Abrirlo antes de la exposición. No se ha contratado ningún plan de pago. La latencia también depende del Wi-Fi y del proveedor de Internet de cada jugador; el alojamiento no garantiza eliminar las pérdidas de su conexión.

## Opción con contenedor

El `Dockerfile` permite ejecutar el mismo servidor en un alojamiento compatible con contenedores y WebSockets. No incluye fuentes Blender, documentos, registros, herramientas del túnel ni dependencias de desarrollo.

## Verificación posterior

- Abrir `/api/health`: debe responder `ok: true`, `app: portal-rush` y `stateHz: 20`.
- Conectar dos navegadores, crear una sala y comprobar movimiento y clasificación.
- Desde una copia de desarrollo: `node tests/public-link.mjs URL_DEL_SERVICIO --browser`.

Fuentes: https://render.com/docs/deploy-node-express-app · https://render.com/docs/websocket · https://render.com/docs/free · https://render.com/docs/regions
