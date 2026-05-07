使用方法(3选1)：
1.使用 Mock 模式（不需要后端）：
   # 在 frontend 目录创建 .env.local 文件，内容：
        VITE_USE_MOCK=true
   # AI 对话为脚本状态机：输入框会预填示范句，原样发送可逐步体验；改写后发送会提示需完整部署才能自定义对话。
   # 可选：打开页面自动以 demo 用户登录（仅 Mock 生效）：
        VITE_DEMO_SEED=true
2.使用真实 API（需要后端运行）：
   # 删除 .env.local 或设置 VITE_USE_MOCK=false
3.临时切换（PowerShell）：
   $env:VITE_USE_MOCK="true"

运行前端：
cd frontend
npm run dev