import { describe, it, expect, vi } from 'vitest';

describe('console suppression in tests', () => {
    it('does not write to stdout when console.log is called', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

        // Call console.log; setup file should have replaced it with no-op
        console.log('this should be suppressed');

        expect(writeSpy).not.toHaveBeenCalled();

        writeSpy.mockRestore();
    });

    it('does not write when console.info is called', () => {
        const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

        console.info('suppressed info');

        expect(writeSpy).not.toHaveBeenCalled();

        writeSpy.mockRestore();
    });
});