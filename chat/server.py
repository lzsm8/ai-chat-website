"""
DeepSeek 对话后端服务
- 托管静态页面（index.html / style.css / app.js）
- /api/chat 代理 DeepSeek API，流式返回（NDJSON）

运行：python server.py  然后访问 http://127.0.0.1:5000
"""
import json
import os

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__)
CORS(app)

# ---------------- 配置 ----------------
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise RuntimeError("未设置 DEEPSEEK_API_KEY，请在 .env 文件或系统环境变量中配置")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-pro")


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "model": MODEL})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages") or []

    if not messages:
        return jsonify({"error": "messages 不能为空"}), 400

    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": float(data.get("temperature", 0.7)),
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        upstream = requests.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            json=payload,
            headers=headers,
            stream=True,
            timeout=180,
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"无法连接 DeepSeek 服务：{exc}"}), 502

    if upstream.status_code != 200:
        return jsonify(
            {"error": f"DeepSeek API 返回 {upstream.status_code}", "detail": upstream.text}
        ), upstream.status_code

    def generate():
        try:
            for raw in upstream.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                line = raw.strip()
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    obj = json.loads(chunk)
                    delta = obj["choices"][0]["delta"].get("content")
                    if delta:
                        yield json.dumps({"delta": delta}, ensure_ascii=False) + "\n"
                except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                    continue
        except GeneratorExit:
            raise
        except Exception as exc:  # noqa: BLE001
            yield json.dumps({"error": str(exc)}, ensure_ascii=False) + "\n"

    return Response(
        generate(),
        mimetype="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    print(f" * 正在启动，访问 http://127.0.0.1:5000  （模型：{MODEL}）")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
