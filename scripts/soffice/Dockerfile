FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-writer-nogui fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 converter
USER converter
ENV HOME=/tmp
