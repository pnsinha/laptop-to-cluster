#!/bin/bash
# readiness.sh -- readiness primitives replacing Compose's depends_on/healthcheck.
#
# Portability note: `nc` is not present on every compute node. Bash's /dev/tcp
# pseudo-device is the fallback and needs no external binary. Timing uses the
# SECONDS builtin rather than counting sleeps, so a slow node cannot inflate
# the measured timeout.

# _port_open <port> -- 0 if something is listening on 127.0.0.1:<port>
_port_open() {
    local port="$1"
    if command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    else
        ( exec 3<>"/dev/tcp/127.0.0.1/$port" ) >/dev/null 2>&1
    fi
}

# wait_for_port <port> [timeout_sec]
# Compose equivalent: depends_on + healthcheck: {test: nc -z ...}
wait_for_port() {
    local port="$1" timeout="${2:-60}" start=$SECONDS
    while ! _port_open "$port"; do
        if (( SECONDS - start >= timeout )); then
            return 1
        fi
        sleep 1
    done
    return 0
}

# wait_for_file <path> [timeout_sec]
# Compose equivalent: depends_on: {condition: service_completed_successfully}
# when the upstream service signals completion by writing a sentinel file.
wait_for_file() {
    local path="$1" timeout="${2:-60}" start=$SECONDS
    while [ ! -f "$path" ]; do
        if (( SECONDS - start >= timeout )); then
            return 1
        fi
        sleep 1
    done
    return 0
}

# wait_for_health <url> [timeout_sec]
# Compose equivalent: healthcheck with an HTTP probe. Requires curl.
wait_for_health() {
    local url="$1" timeout="${2:-60}" start=$SECONDS
    command -v curl >/dev/null 2>&1 || return 2
    while ! curl -sf "$url" >/dev/null 2>&1; do
        if (( SECONDS - start >= timeout )); then
            return 1
        fi
        sleep 1
    done
    return 0
}
