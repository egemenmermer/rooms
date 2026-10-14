FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/youtube && /opt/youtube/bin/pip install --no-cache-dir "yt-dlp[default]==2026.8.19"
ENV PATH="/opt/youtube/bin:${PATH}"
WORKDIR /service
RUN npm init -y && npm install --omit=dev @livekit/rtc-node@1.1.0
COPY dist-services/music.cjs ./music.cjs
RUN useradd --system --uid 10001 music && mkdir /state && chown music:music /state
USER music
ENV MUSIC_PORT=3040
CMD ["node","music.cjs"]
