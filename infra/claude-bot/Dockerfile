# @claude chat bot: the bundled service plus the official Claude Code CLI and developer tools.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client jq ripgrep \
     python3 make g++ less procps gnupg tini \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@2.1.301 pnpm@11.25.0 && npm cache clean --force
RUN useradd -m -u 10002 -s /bin/bash claude && mkdir -p /data /workspace && chown claude:claude /data /workspace
COPY claude-bot.cjs /opt/claude-bot/claude-bot.cjs
ENV ROOMS_CLAUDE_DATA=/data ROOMS_CLAUDE_WORKDIR=/workspace DISABLE_AUTOUPDATER=1 \
    GIT_AUTHOR_NAME="ROOMS Claude" GIT_AUTHOR_EMAIL="claude-bot@rooms.local" \
    GIT_COMMITTER_NAME="ROOMS Claude" GIT_COMMITTER_EMAIL="claude-bot@rooms.local"
USER claude
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/opt/claude-bot/claude-bot.cjs"]
