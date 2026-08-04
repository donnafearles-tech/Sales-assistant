export class Logger {
    private logs: string[] = [];

    private addLog(level: string, message: string, data?: any) {
        const timestamp = new Date().toISOString();
        let dataStr = '';
        if (data) {
            try {
                dataStr = ` | Data: ${data instanceof Error ? data.stack || data.message : JSON.stringify(data)}`;
            } catch (e) {
                dataStr = ` | Data: [Unserializable Object]`;
            }
        }
        const logEntry = `[${timestamp}] [${level}] ${message}${dataStr}`;
        this.logs.push(logEntry);
        
        // Also log to console for developer convenience
        if (level === 'ERROR') {
            console.error(message, data || '');
        } else if (level === 'WARN') {
            console.warn(message, data || '');
        } else {
            console.log(message, data || '');
        }
    }

    info(message: string, data?: any) { this.addLog('INFO', message, data); }
    warn(message: string, data?: any) { this.addLog('WARN', message, data); }
    error(message: string, data?: any) { this.addLog('ERROR', message, data); }

    exportLogs() {
        if (this.logs.length === 0) {
            this.warn("No logs to export.");
            return;
        }
        const blob = new Blob([this.logs.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sharefile-assistant-logs-${new Date().toISOString().replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.info("Logs exported successfully.");
    }

    clear() {
        this.logs = [];
    }
}

export const logger = new Logger();
