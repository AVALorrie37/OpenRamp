import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
/** GitHub project Pages base, e.g. /OpenRamp/ — set only in CI; local default is '/' */
function pagesBaseFromEnv() {
    const raw = (process.env.VITE_PAGES_BASE || '').trim();
    if (!raw)
        return '/';
    const lead = raw.startsWith('/') ? raw : `/${raw}`;
    return lead.endsWith('/') ? lead : `${lead}/`;
}
export default defineConfig(() => {
    // 动态判断是否启用 Mock 模式
    const isMock = process.env.VITE_USE_MOCK === 'true';
    return {
        base: pagesBaseFromEnv(),
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        server: {
            port: 5173,
            fs: {
                allow: ['..']
            },
            // 核心：根据环境变量动态配置代理
            proxy: isMock
                ? undefined // Mock 模式：不启用代理，前端完全独立
                : {
                    '/api': {
                        target: 'http://localhost:8000',
                        changeOrigin: true,
                    }
                }
        },
        build: {
            outDir: 'dist'
        }
    };
});
