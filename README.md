# AI Chat · DeepSeek

一个美观的 AI 对话网页：前端使用 **HTML / CSS / JS / Axios**，后端使用 **Python (Flask)** 代理 DeepSeek API，支持流式输出、Markdown 渲染与代码高亮、多会话历史。

## 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量（复制示例文件并填入密钥）
cp .env.example .env   # Windows 下可手动复制重命名

# 3. 启动后端
python server.py

# 4. 打开浏览器访问
http://127.0.0.1:5000
```

## 项目结构

```
chat/
├── index.html        # 页面结构
├── style.css         # 深色主题样式
├── app.js            # 前端逻辑（Axios 流式请求 + Markdown 渲染）
├── server.py         # Flask 后端（代理 DeepSeek API）
└── requirements.txt  # Python 依赖
```

## 配置

密钥与模型通过环境变量配置（推荐放入 `.env` 文件，程序启动时自动加载）：

- `DEEPSEEK_API_KEY`（**必填**，你的 DeepSeek API Key）
- `DEEPSEEK_MODEL`（默认 `deepseek-v4-pro`）
- `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）

> ⚠️ 注意：API Key 属于敏感信息，`.env` 已被 `.gitignore` 忽略，请勿将真实密钥提交到仓库。未设置 `DEEPSEEK_API_KEY` 时程序会启动失败并提示。
