declare module '@playwright/test' {
    interface Page {
        wait_for_websocket(timeout?: number): Promise<WebSocket>;
    }
}
export {};
//# sourceMappingURL=webhook-gateway.test.d.ts.map