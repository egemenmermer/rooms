FROM node:24-bookworm-slim
WORKDIR /service
COPY dist-services/apns.cjs ./apns.cjs
RUN useradd --system --uid 10002 apns
USER apns
CMD ["node","apns.cjs"]
