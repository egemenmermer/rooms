FROM node:24-bookworm-slim
# ffmpeg remuxes provider streams to HLS (video copied, audio to AAC); no transcoding.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY dist-services/cinema.cjs ./cinema.cjs
RUN useradd --system --uid 10003 cinema && mkdir /state && chown cinema:cinema /state
USER cinema
ENV CINEMA_PORT=3050 ROOMS_CINEMA_STATE=/state ROOMS_CINEMA_HLS=/hls
CMD ["node","cinema.cjs"]
