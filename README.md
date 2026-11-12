# Portal Rush · Odisea planetaria

Videojuego multijugador 3D para navegador, desarrollado como proyecto final de Programación de Entornos Multimedia. De uno a cuatro jugadores compiten en seis planetas, acumulan puntos y viajan en cohete entre niveles. Incluye práctica individual y vestuario con materiales PBR.

**Integrantes:** Juan Miguel Hernandez, Eval Samuel Molina Fuertes y Luis Miguel David Campo.

## Ejecutar

Requiere Node.js 20 o superior; la versión de despliegue está fijada en `.node-version`.

    npm ci
    npm start

Abrir http://localhost:3000. En Windows también se puede ejecutar `INICIAR.bat`.

Para jugar por Wi-Fi, los demás equipos abren `http://IP_DEL_ANFITRION:3000`. El anfitrión crea una sala y comparte su código de seis números antes de iniciar. El servidor debe permanecer encendido y accesible desde la red privada.

Para acceso temporal desde otras redes, ejecutar `ABRIR_PUBLICO.bat` y compartir la dirección HTTPS que verifica el lanzador. `CERRAR_ENLACE.bat` cierra el túnel y `CERRAR_JUEGO.bat` detiene los procesos iniciados por el lanzador. Este acceso temporal depende del computador anfitrión.

## Los seis niveles

| Planeta | Minijuego | Objetivo |
|---|---|---|
| Mercurio | Carrera láser | Superar plataformas, láseres, obstáculos y portal hasta llegar al cohete. |
| Marte | Arsenal orbital | Conseguir una eliminación con cada una de las diez armas. |
| Neptuno | Guerra de color | Conservar más casillas pintadas al terminar los dos minutos. |
| Urano | Fiebre de cristales | Reunir 15 cristales entre plataformas de baja gravedad. |
| Venus | Última órbita | Sobrevivir a meteoritos que destruyen el suelo. |
| Saturno | Laberinto de sombras | Recorrer el laberinto con linterna, guardar el checkpoint y encontrar la salida. |

Los puestos otorgan 10, 7, 5 y 3 puntos por ronda. El anfitrión puede elegir torneo completo o un nivel de práctica. En Marte, la práctica individual incluye un dron.

## Controles

| Control | Acción |
|---|---|
| WASD / flechas | Moverse |
| Espacio | Saltar, excepto en Saturno |
| Ratón | Girar cámara; apuntar en Marte y Saturno |
| Clic / F | Disparar en Marte |
| E | Empujar en Neptuno, Urano y Venus |
| L | Alternar la linterna en Saturno |
| R | Volver al checkpoint cuando está permitido; en Venus, retirarse |
| Esc | Liberar la captura del ratón |

El selector **Gráficos** ofrece Fluido, Equilibrado y Alto. La interfaz muestra FPS y latencia; «SIN RESPUESTA» indica que venció la espera de una respuesta del servidor.

## Arquitectura

- **Three.js 0.180.0:** escenarios GLB, cámaras, materiales, HDRI, sombras, partículas y audio.
- **Cannon-es 0.20.0:** física autoritativa a 60 Hz, cuerpos, gravedad, contactos e impulsos.
- **Socket.IO 4.8.1:** salas, entradas y sincronización. Los estados periódicos se envían aproximadamente a 20 Hz y se descartan cuando el transporte está congestionado; los eventos de juego mantienen entrega fiable mientras existe conexión.
- **Express 5.1.0:** archivos del juego y `/api/health`.

Las salas y resultados están en memoria y se borran al reiniciar el servidor. El despliegue actual utiliza una sola instancia.

    server.js / game.js / classic-race.js   Servidor, reglas y físicas
    public/                               Interfaz y recursos de ejecución
    shared/                               Configuración compartida de mundos y armas
    tests/                                Pruebas de reglas, red y navegador
    scripts/*.ps1                         Lanzadores del túnel temporal en Windows
    render.yaml                           Despliegue Node.js en Render
    Dockerfile                            Alternativa de despliegue con contenedor

## Pruebas

    npm test
    npm run test:browser
    node tests/browser-maze.mjs
    node tests/browser-combat.mjs
    node tests/public-link.mjs https://URL_DEL_JUEGO --browser

Las pruebas de navegador requieren Google Chrome instalado. Generan evidencias locales en `artifacts/`. Las 27 pruebas de reglas y red cubren los seis mundos, cuatro conexiones, impactos, colisiones y clasificación.

## Desplegar

Consultar [DESPLEGAR.md](DESPLEGAR.md). El servidor escucha en `0.0.0.0` y respeta la variable `PORT`. El archivo `render.yaml` configura un servicio Node.js con plan gratuito, región Virginia y verificación en `/api/health`.

## Recursos y créditos

Los modelos, texturas procedurales y sonidos sintetizados se crearon para el proyecto. El HDRI **Rogland Clear Night** es de **Greg Zaal / Poly Haven**, con licencia **CC0**: https://polyhaven.com/a/rogland_clear_night.

El repositorio contiene los GLB, texturas, sonidos y HDRI que necesita el navegador. Los documentos de exposición, capturas, herramientas descargadas, registros, dependencias instaladas y fuentes Blender locales se excluyen mediante `.gitignore`.
