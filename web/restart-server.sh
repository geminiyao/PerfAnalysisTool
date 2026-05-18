#!/bin/bash
#
# PerfAnalysisTool 后端服务重启脚本
# 用法: ./restart-server.sh [start|stop|restart|status]
#

# ============ 配置 ============
NODE_PATH="/data/home/garyychen/.workbuddy/binaries/node/versions/20.18.0/bin"
PROJECT_DIR="/data/workspace/PerfAnalysisTool/web"
LOG_FILE="/data/workspace/PerfAnalysisTool/web/data/server.log"
PID_FILE="/data/workspace/PerfAnalysisTool/web/data/server.pid"
SERVER_PORT=3000
HEALTH_URL="http://localhost:${SERVER_PORT}/api/health"
MAX_WAIT=10  # 最大等待秒数

# ============ 颜色 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============ 函数 ============

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 确保 node 在 PATH 中
setup_env() {
    export PATH="${NODE_PATH}:$PATH"
    if ! command -v node &>/dev/null; then
        log_error "node 未找到，请检查 NODE_PATH 配置"
        exit 1
    fi
}

# 获取当前运行的后端进程 PID
get_running_pid() {
    # 优先从 PID 文件获取
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return
        fi
    fi
    # 回退: 通过端口查找
    local pid=$(ss -tlnp 2>/dev/null | grep ":${SERVER_PORT}" | grep -oP 'pid=\K[0-9]+' | head -1)
    echo "$pid"
}

# 停止服务
stop_server() {
    local pid=$(get_running_pid)
    if [ -z "$pid" ]; then
        log_warn "后端服务未在运行"
        return 0
    fi

    log_info "正在停止后端服务 (PID: $pid)..."
    kill "$pid" 2>/dev/null

    # 等待进程退出
    local count=0
    while kill -0 "$pid" 2>/dev/null && [ $count -lt 5 ]; do
        sleep 1
        count=$((count + 1))
    done

    # 如果还没退出，强制 kill
    if kill -0 "$pid" 2>/dev/null; then
        log_warn "进程未响应 SIGTERM，强制终止..."
        kill -9 "$pid" 2>/dev/null
        sleep 1
    fi

    rm -f "$PID_FILE"
    log_info "服务已停止"
}

# 启动服务
start_server() {
    local pid=$(get_running_pid)
    if [ -n "$pid" ]; then
        log_warn "后端服务已在运行 (PID: $pid)，无需重复启动"
        return 0
    fi

    # 确保日志目录存在
    mkdir -p "$(dirname "$LOG_FILE")"

    log_info "正在启动后端服务..."
    cd "$PROJECT_DIR" || exit 1

    nohup npx tsx watch server/index.ts >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"

    # 等待服务就绪
    log_info "等待服务就绪 (PID: $new_pid)..."
    local count=0
    while [ $count -lt $MAX_WAIT ]; do
        sleep 1
        count=$((count + 1))

        # 检查进程是否还活着
        if ! kill -0 "$new_pid" 2>/dev/null; then
            log_error "服务启动失败！查看日志: $LOG_FILE"
            tail -20 "$LOG_FILE"
            rm -f "$PID_FILE"
            return 1
        fi

        # 健康检查
        if curl -s --max-time 2 "$HEALTH_URL" | grep -q '"status":"ok"'; then
            log_info "✅ 后端服务启动成功！"
            log_info "   PID: $new_pid"
            log_info "   端口: $SERVER_PORT"
            log_info "   日志: $LOG_FILE"
            return 0
        fi
    done

    log_error "服务启动超时（${MAX_WAIT}s），请检查日志: $LOG_FILE"
    tail -10 "$LOG_FILE"
    return 1
}

# 重启服务
restart_server() {
    log_info "========== 重启后端服务 =========="
    stop_server
    sleep 1
    start_server
}

# 查看状态
show_status() {
    local pid=$(get_running_pid)
    if [ -z "$pid" ]; then
        log_error "后端服务未运行 ❌"
        return 1
    fi

    # 健康检查
    local health=$(curl -s --max-time 3 "$HEALTH_URL" 2>/dev/null)
    if echo "$health" | grep -q '"status":"ok"'; then
        log_info "后端服务运行中 ✅"
        log_info "  PID: $pid"
        log_info "  端口: $SERVER_PORT"
        log_info "  响应: $health"
    else
        log_warn "后端进程在运行 (PID: $pid)，但健康检查失败"
        log_warn "  可能正在启动中，或服务异常"
    fi
}

# ============ 主逻辑 ============

setup_env

case "${1:-restart}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        show_status
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        echo ""
        echo "  start   - 启动后端服务（如果未运行）"
        echo "  stop    - 停止后端服务"
        echo "  restart - 重启后端服务（默认）"
        echo "  status  - 查看服务状态"
        exit 1
        ;;
esac
