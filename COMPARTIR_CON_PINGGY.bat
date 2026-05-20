@echo off
title Compartir Bingo con Pinggy (100% Compatible con Celulares)
chcp 65001 > nul
echo ====================================================================
echo 🎱      COMPARTIR BINGO CON PINGGY (SIN ANUNCIOS NI TRABAS)       🎱
echo ====================================================================
echo.
echo Hola! Esta es una alternativa excelente a Localtunnel. 
echo Pinggy es súper confiable y funciona al 100% en teléfonos móviles, 
echo tablets y pestañas de incógnito porque NO tiene pantallas de anuncios
echo ni advertencias que bloqueen la conexión Socket.io.
echo.
echo ⚠️ IMPORTANTE: Asegúrate de tener encendido tu servidor de Bingo en
echo otra ventana (por ejemplo, ejecutando "npm start").
echo.
echo Presiona cualquier tecla para iniciar...
pause > nul
echo.
echo 🔎 Verificando si tienes SSH instalado en tu sistema Windows...
where ssh >nul 2>nul
if %errorlevel% equ 0 goto start_ssh

echo.
echo ❌ ERROR: SSH no está habilitado o instalado en tu computadora.
echo.
echo Para solucionarlo y poder usar Pinggy:
echo 1. Abre el menú de Inicio de Windows y busca: Características opcionales
echo    (o en inglés: Optional Features)
echo 2. Busca "Cliente de OpenSSH" (OpenSSH Client) en la lista.
echo 3. Si no está instalado, haz clic en "Agregar característica" e instálalo.
echo.
echo Si no quieres instalarlo, puedes usar "COMPARTIR_CON_AMIGOS.bat" (Localtunnel).
echo.
goto end

:start_ssh
echo.
echo 🚀 Conectando a Pinggy usando SSH seguro...
echo.
echo 💡 NOTA: Si en la pantalla aparece un mensaje preguntando:
echo    "Are you sure you want to continue connecting (yes/no/[fingerprint])?"
echo    Escribe: yes  (y presiona Enter) para registrar la clave.
echo.
echo Iniciando túnel publico...
echo.
ssh -o StrictHostKeyChecking=accept-new -R 80:localhost:3000 play@pinggy.io
if %errorlevel% equ 0 goto end

echo.
echo ❌ Hubo un problema al conectar con Pinggy.
echo Verifica tu conexión a internet o que tu servidor de Bingo (puerto 3000) esté encendido.

:end
echo.
echo La ventana del túnel se ha cerrado.
echo Presiona cualquier tecla para salir...
pause > nul
