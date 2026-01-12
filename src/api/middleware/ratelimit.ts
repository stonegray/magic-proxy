import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { cpus } from 'os';
import { zone } from '../../logging/zone';

const log = zone('api.ratelimit');

// CPU monitoring state
let currentMaxRps = 10; // base rate: 10 requests per second

/**
 * Calculate CPU usage percentage
 */
function getCpuUsagePercentage(): number {
    const cpuCores = cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const core of cpuCores) {
        for (const type of Object.keys(core.times)) {
            totalTick += core.times[type as keyof typeof core.times];
        }
        totalIdle += core.times.idle;
    }

    const idle = totalIdle / cpuCores.length;
    const total = totalTick / cpuCores.length;
    const usage = 100 - ~~(100 * idle / total);

    return usage;
}

/**
 * Calculate rate limit (requests per second) based on CPU usage
 * At 60%: 10 rps
 * At 90%: 1 rps
 * At 95%: 0.1 rps
 */
function calculateRpsFromCpu(cpuPercent: number): number {
    if (cpuPercent < 60) {
        return 10; // Base rate
    }

    if (cpuPercent >= 95) {
        return 0.1; // Minimum rate
    }

    if (cpuPercent >= 90) {
        // Interpolate from 90% (1 rps) to 95% (0.1 rps)
        const range = 95 - 90;
        const position = cpuPercent - 90;
        const ratio = position / range;
        // Logarithmic scale from 1 to 0.1
        return Math.pow(10, 1 - ratio);
    }

    // Interpolate from 60% (10 rps) to 90% (1 rps)
    const range = 90 - 60;
    const position = cpuPercent - 60;
    const ratio = position / range;
    // Logarithmic scale from 10 to 1
    return 10 * Math.pow(10, -ratio);
}

/**
 * Start CPU monitoring every 5 seconds
 */
function startCpuMonitoring(): void {
    setInterval(() => {
        const cpuUsage = getCpuUsagePercentage();
        const newMaxRps = calculateRpsFromCpu(cpuUsage);

        if (newMaxRps !== currentMaxRps) {
            currentMaxRps = newMaxRps;
        }
    }, 5000); // Check every 5 seconds
}

// Start monitoring on module load
startCpuMonitoring();

/**
 * Global API rate limiter with CPU-based dynamic adjustment
 * Base: 10 requests per second globally (not per-IP)
 * Adjusts dynamically based on CPU usage (60-95%)
 */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: 1000, // 1 second window
    max: () => Math.ceil(currentMaxRps), // Dynamic limit based on CPU
    statusCode: 429, // 429 status = Too Many Requests
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    keyGenerator: (_req, _res) => 'global' // All requests share the same limit
});

