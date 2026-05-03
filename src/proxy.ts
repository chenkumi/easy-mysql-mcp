/**
 * Stdout Protection Proxy
 * This module MUST be imported as the very first import in the application.
 * It intercepts all writes to stdout and redirects non-MCP JSON output to stderr.
 * This prevents protocol pollution from libraries that log to stdout (like dotenvx).
 */

const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// @ts-ignore
process.stdout.write = (chunk, encoding, callback) => {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        const str = chunk.toString();
        // Allow MCP JSON-RPC messages and Content-Length headers (used in some transports)
        if (str.includes('"jsonrpc":"2.0"') || str.includes('Content-Length:')) {
            return originalStdoutWrite(chunk, encoding, callback);
        }
    }

    // Redirect everything else to stderr
    return process.stderr.write(chunk, encoding, callback);
};

// Also patch console.log to use stderr, just in case
const originalConsoleLog = console.log;
console.log = (...args) => {
    console.error(...args);
};

export { };
