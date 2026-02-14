import * as assert from 'assert';
import { ReindexScheduler } from '../../services/ReindexScheduler';

describe('ReindexScheduler', () => {
    it('should debounce frequent schedule requests', async () => {
        let callCount = 0;
        const scheduler = new ReindexScheduler(() => {
            callCount++;
        }, 10);

        scheduler.schedule();
        scheduler.schedule();
        scheduler.schedule();

        await new Promise((resolve) => setTimeout(resolve, 35));
        assert.strictEqual(callCount, 1, 'Only one callback execution is expected after debounce');
    });

    it('should release pending timer on dispose', async () => {
        let callCount = 0;
        const scheduler = new ReindexScheduler(() => {
            callCount++;
        }, 20);

        scheduler.schedule();
        assert.strictEqual(scheduler.hasPending(), true, 'Timer should be pending after schedule');
        scheduler.dispose();
        assert.strictEqual(scheduler.hasPending(), false, 'Timer should be cleared after dispose');

        await new Promise((resolve) => setTimeout(resolve, 35));
        assert.strictEqual(callCount, 0, 'Disposed scheduler should not execute callback');
    });
});
