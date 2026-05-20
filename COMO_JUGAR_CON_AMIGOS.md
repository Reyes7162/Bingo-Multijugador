# 🎱 Guía: ¿Cómo jugar al Bingo con amigos en otras casas?

Esta guía te explicará cómo permitir que tus amigos o familiares se unan a tu juego de Bingo desde **sus propias casas** (usando sus propios Wi-Fi o datos móviles), cómo solucionar el error de conexión en celulares, y cómo usar la nueva función de **Inicio Anticipado** para el Anfitrión.

---

## 🌎 El Problema de la Red Local (Wi-Fi)
Cuando abres el juego y usas una dirección IP como `http://192.168.1.X:3000`, esta dirección es **privada y local**. Solo funciona para los dispositivos que están conectados al **mismo Wi-Fi de tu casa**. Si tu amigo está en **su casa**, su dispositivo no tiene acceso físico a tu router, por lo que el juego no le cargará.

Para solucionarlo, necesitamos crear un **túnel público seguro** que redirija el tráfico de Internet hacia tu computadora local. ¡Y es completamente **gratis** y **sencillo**!

---

## 🚨 Solución al error: "No se pudo establecer conexión con el servidor..."
Si tu amigo logra entrar a la página web del juego pero al intentar unirse le aparece la alerta *"No se pudo establecer conexión..."*, se debe a lo siguiente:

### ¿Por qué ocurre?
**Localtunnel** tiene una pantalla de advertencia ("Friendly Reminder") de seguridad la primera vez que se accede a un enlace. 
1. Cuando entras en celulares o en pestañas de incógnito, los navegadores bloquean la cookie de seguridad de Localtunnel en segundo plano.
2. Esto provoca que el navegador de tu amigo cargue la página inicial del Bingo, pero bloquee la conexión del Socket en tiempo real (Socket.io), arrojando el error de conexión.

### ¿Cómo lo hemos solucionado?
Hemos tomado **dos medidas definitivas** para solucionar esto:

#### ⚡ Solución Automática en el Código (Bypass de Localtunnel)
Hemos modificado el código en `script.js` para inyectar automáticamente la cabecera `bypass-tunnel-reminder: true` en todas las solicitudes del Socket. Esto le dice a Localtunnel que deje pasar la conexión en tiempo real automáticamente sin importar el navegador o dispositivo que use tu amigo.

#### 🌟 Solución Alternativa: Usar Pinggy (¡100% Recomendado para Celulares!)
He creado un archivo llamado `COMPARTIR_CON_PINGGY.bat` en tu carpeta. 
**Pinggy** es una alternativa a Localtunnel que **NO tiene pantallas de advertencia de ningún tipo**. La conexión fluye de manera directa y transparente, por lo que funciona al 100% en todos los celulares de inmediato.

---

## 🛠️ Método A: Usar Pinggy (La alternativa más estable para celulares)

1. **Paso 1:** Inicia tu servidor de Bingo normalmente (ejecutando `npm start`).
2. **Paso 2:** Haz **doble clic** en el archivo `COMPARTIR_CON_PINGGY.bat`.
3. **Paso 3:** Presiona una tecla. Verás que se conecta a través de SSH y te dará un enlace HTTPS público resaltado en verde similar a:
   `https://cplxxxxx.pinggy.link`
4. **Paso 4:** Pásale ese enlace a tu amigo. ¡Al abrirlo entrará directamente al juego sin anuncios ni errores de socket!

---

## 🛠️ Método B: Usar Localtunnel (Con el parche de bypass incluido)

1. **Paso 1:** Inicia tu servidor de Bingo normalmente (ejecutando `npm start`).
2. **Paso 2:** Haz **doble clic** en el archivo `COMPARTIR_CON_AMIGOS.bat`.
3. **Paso 3:** Presiona una tecla. Te dará tu enlace de Localtunnel (ej: `https://hot-heads-mix.loca.lt`).
4. **Paso 4:** Envíale ese enlace a tu amigo.
5. **Paso 5 (Importante):** Al hacer clic por primera vez en el enlace, tu amigo verá una pantalla azul de advertencia de Localtunnel. Debe pulsar el botón azul que dice **"Click to Continue"** o **"Visit Site"**. Una vez que lo pulse, el juego se cargará y gracias al parche de bypass que programamos, la conexión del socket se establecerá sin problemas.

---

## 🚀 Nueva Función: Iniciar Partida de Inmediato (Anfitrión)

Hemos escuchado tu petición y ahora el Anfitrión tiene control total del lobby:
- **¿Cómo funciona?** Antes, el juego obligaba a esperar 2 minutos completos a que finalice la cuenta regresiva en el Lobby para que comience la partida.
- **Ahora:** En la pantalla de **Anfitrión (Bolillero)**, mientras los jugadores estén en el Lobby comprando sus cartones, el botón de sacar bolillas estará oculto y verás un nuevo botón especial en color degradado dorado: **🚀 Iniciar Partida Ya**.
- En cuanto el anfitrión considere que todos los jugadores se han conectado y comprado sus cartones correspondientes, simplemente hace clic en **🚀 Iniciar Partida Ya**.
- Al hacer clic, el temporizador del lobby se detendrá inmediatamente, la partida cambiará a estado de juego activo (`playing`), y el bolillero del anfitrión y los cartones de los jugadores se habilitarán al mismo tiempo de manera sincronizada.

¡Que disfruten del Bingo Real Multijugador! 🎱✨
