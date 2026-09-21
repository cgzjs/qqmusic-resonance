# 内置试听音源

四段音源由本项目的 `scripts/generate-demo-audio.mjs` 原创合成，用于单人交互演示，不是 Fishmans、Nujabes 等艺人的录音，也不接入外部曲库。

| 文件 | 展示名称 |
| --- | --- |
| night-signal.wav | 夜行信号 |
| glass-platform.wav | 玻璃站台 |
| evening-breeze.wav | 晚风慢拍 |
| dawn-echo.wav | 清晨回声 |

单声道 PCM WAV，22050 Hz，16 bit，每段 24 秒。音源与生成脚本随项目按 MIT License 提供。运行 `node scripts/generate-demo-audio.mjs` 可重建。
