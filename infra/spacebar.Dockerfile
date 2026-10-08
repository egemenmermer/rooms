FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /spacebar
ARG SPACEBAR_REV=0eb6f04f6d8055dba0194d10c47c33e074a8a281
RUN git clone https://github.com/spacebarchat/server.git . && git checkout "$SPACEBAR_REV"
RUN npm ci --include=dev && npm run build
ENV NODE_ENV=production PORT=3001 THREADS=1 CONFIG_PATH=/config/config.json
EXPOSE 3001
CMD ["npm", "start"]
