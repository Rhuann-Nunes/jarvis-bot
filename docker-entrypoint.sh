#!/bin/bash

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