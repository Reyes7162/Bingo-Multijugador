@echo off
title Compartir Bingo con Amigos (Otras Casas)
chcp 65001 > nul
echo ====================================================================
echo 🎱     COMPARTIR BINGO REAL MULTIJUGADOR - MODO EXTERNO     🎱
echo ====================================================================
echo.
echo Hola! Este programa creará un "túnel" de Internet temporal y seguro.
echo Esto permite que tus amigos jueguen contigo desde sus propias casas
echo (estando en otra red Wi-Fi o con sus datos móviles) de forma gratuita.
echo.
echo ⚠️ IMPORTANTE: Asegúrate de tener encendido tu servidor de Bingo en
echo otra ventana de la consola (por ejemplo, ejecutando "npm start").
echo.
echo Presiona cualquier tecla para iniciar...
pause > nul
echo.
echo 🔎 Verificando si tienes Node.js / NPM instalado...
where npx >nul 2>nul
if %errorlevel% equ 0 goto start_tunnel

echo.
echo ❌ ERROR: Node.js/NPM no está instalado o no está configurado en tu PATH.
echo.
echo Para jugar en multijugador, necesitas tener Node.js instalado.
echo Descárgalo gratis desde: https://nodejs.org/ (selecciona la versión LTS)
echo.
goto end

:start_tunnel
echo.
echo 🚀 Conectando con los servidores de Localtunnel...
echo (Si es la primera vez, se descargará automáticamente, espera un momento)
echo.
call npx localtunnel --port 3000
if %errorlevel% equ 0 goto end

echo.
echo ❌ Hubo un problema al conectar con Localtunnel o se canceló el proceso.

:end
echo.
echo La ventana del túnel se ha cerrado.
echo Presiona cualquier tecla para salir...
pause > nul
