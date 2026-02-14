export class ReindexScheduler {
    private timer: NodeJS.Timeout | undefined;

    constructor(private readonly callback: () => void, private readonly delayMs: number = 150) {}

    public schedule(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.callback();
        }, this.delayMs);
    }

    public hasPending(): boolean {
        return this.timer !== undefined;
    }

    public dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
