// Suppress console.log during tests so that accidental logging does not pollute test output.
if (process.env.NODE_ENV === 'test') {
    // Replace console.log with a no-op function
    console.log = () => { /* suppressed in tests */ };
    console.info = () => { /* suppressed in tests */ };
    console.error = () => { /* suppressed in tests */ };
    console.warn = () => { /* suppressed in tests */ };
}