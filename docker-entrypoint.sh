#!/bin/bash

# Iniciar Xvfb
Xvfb :99 -screen 0 1280x1024x24 > /dev/null 2>&1 &

# Aguardar Xvfb iniciar
sleep 1

# Configurar display
export DISPLAY=:99

# Garantir que o D-Bus está rodando
if [ ! -e /var/run/dbus/system_bus_socket ]; then
    echo "Iniciando D-Bus..."
    mkdir -p /var/run/dbus
    dbus-daemon --system --fork
    sleep 1
fi

# Verificar se o machine-id existe e está correto
if [ ! -s /etc/machine-id ]; then
    echo "Gerando machine-id..."
    dbus-uuidgen > /etc/machine-id
fi

# Executar o comando passado (normalmente npm start)
exec "$@" 