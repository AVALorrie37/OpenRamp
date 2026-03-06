import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    // 动态判断是否启用 Mock 模式
    var isMock = process.env.VITE_USE_MOCK === 'true';
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        server: {
            port: 5173,
            // 核心：根据环境变量动态配置代理
            proxy: isMock
                ? undefined // Mock 模式：不启用代理，前端完全独立
                : {
                    '/api': {
                        target: 'http://localhost:8000', // 后端服务地址
                        changeOrigin: true,
                        rewrite: function (path) { return path.replace(/^\/api/, ''); }, // 去掉 /api 前缀
                    }
                }
        },
        build: {
            outDir: 'dist'
        }
    };
});
