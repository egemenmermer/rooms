FROM node:24-bookworm-slim
WORKDIR /service
RUN npm init -y && npm install --omit=dev --ignore-scripts fastify@5.12.5 @fastify/rate-limit@11.2.0 livekit-server-sdk@2.19.1
COPY dist-services/access.cjs ./access.cjs
ENV SERVICE_HOST=0.0.0.0
CMD ["node", "access.cjs"]
