# Static ffmpeg/ffprobe pinned to the version the relay is tested with (Debian's 5.1 lacks
# -readrate_initial_burst, -readrate_catchup and the HLS demuxer's extension options).
FROM mwader/static-ffmpeg:9.0.2 AS ffmpeg

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
WORKDIR /service
COPY dist-services/cinema.cjs ./cinema.cjs
RUN useradd --system --uid 10003 cinema && mkdir /state && chown cinema:cinema /state
USER cinema
# Listen on the container network so the reverse proxy reaches cinema:3050.
ENV CINEMA_PORT=3050 SERVICE_HOST=0.0.0.0 ROOMS_CINEMA_STATE=/state ROOMS_CINEMA_HLS=/hls ROOMS_CINEMA_VOD_WINDOW_SEC=60
CMD ["node","cinema.cjs"]
