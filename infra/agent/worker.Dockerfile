# Pin the official browser runtime and unmodified provider CLIs.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
RUN npm install -g @openai/codex@0.161.0 @anthropic-ai/claude-code@2.1.293 && mkdir -p /opt/rooms-worker && cd /opt/rooms-worker && npm install playwright@1.64.0
RUN groupadd -g 10001 rooms-worker && useradd -m -u 10001 -g 10001 agent
ENV NODE_PATH=/opt/rooms-worker/node_modules
COPY browser.cjs /opt/rooms-worker/browser.cjs
USER 10001:10001
WORKDIR /workspace
