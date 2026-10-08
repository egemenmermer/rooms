# Resolve and pin an image digest on the deployment host before production use.
FROM node:24-bookworm-slim
RUN groupadd -g 10001 rooms-egress && useradd -u 10001 -g 10001 rooms-egress
COPY egress-proxy.mjs /opt/rooms-egress/egress-proxy.mjs
USER 10001:10001
CMD ["node", "/opt/rooms-egress/egress-proxy.mjs"]
