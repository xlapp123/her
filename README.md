# st-background-keeper

SillyTavern 手机 Termux 部署环境后台保活扩展插件。

## 功能
- **静音音频管道（Silent Audio Loop）**：维持媒体焦点，降低系统冻结优先级。
- **Screen Wake Lock API**：在支持的浏览器中保持线程唤醒。
- **后台心跳轮询**：定期与后端通信，防止 Node.js 进程闲置休眠。

## 安装方式
1. 将本仓库克隆或上传至 GitHub 公开仓库。
2. 打开 SillyTavern -> 扩展管理 (Extensions) -> 安装扩展 (Install Extension)。
3. 输入你的 GitHub 仓库地址，点击安装。