# syntax=docker/dockerfile:1
# 1) build the Astro site
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN npm run build

# 2) embed it into one Go binary
FROM golang:1.26-alpine AS bin
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY internal ./internal
COPY --from=web /src/web/dist ./web/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/cardpress .
RUN mkdir /out/data

# 3) tiny runtime image
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=bin /out/cardpress /cardpress
ARG BASE_PATH=/
COPY --from=bin --chown=nonroot:nonroot /out/data /data
# The container listens on every interface, so the server insists on CARDPRESS_API_TOKEN (or CARDPRESS_INSECURE=1 when something
# else, such as a loopback-only port mapping, protects it).
ENV ADDR=:8080 BASE_PATH=${BASE_PATH} CARDPRESS_DB_URL=file:/data/cardpress.db
VOLUME /data
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/cardpress"]
