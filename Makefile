# CardPress
APP      := cardpress
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
BASE_PATH ?= /
LDFLAGS  := -s -w -X main.version=$(VERSION)
PLATFORMS := darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64

.PHONY: dev api web build run release test docker docker-run clean

api:            ## Go API only, on http://127.0.0.1:8080 (no embedded web app)
	CARDPRESS_SERVE_WEB=false go run . -addr 127.0.0.1:8080

dev:            ## API + Astro dev server with hot reload (http://localhost:4321, /api proxied to :8080)
	@trap 'kill 0' INT TERM EXIT; \
	CARDPRESS_SERVE_WEB=false go run . -addr 127.0.0.1:8080 & \
	cd web && npm run dev & \
	wait

test:           ## Go tests, web type check and web unit tests
	go test ./... && cd web && npm run check && npm test

web:            ## Build the static site into web/dist
	cd web && npm ci && BASE_PATH=$(BASE_PATH) npm run build

build: web      ## Build one binary with the site embedded -> bin/cardpress
	CGO_ENABLED=0 go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(APP) .

run: build      ## Build and run on http://localhost:8080
	./bin/$(APP) -base $(BASE_PATH)

release: web    ## Cross-compile binaries into dist/
	@mkdir -p dist
	@for p in $(PLATFORMS); do \
		os=$${p%/*}; arch=$${p#*/}; ext=; [ $$os = windows ] && ext=.exe; \
		echo "-> $$os/$$arch"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(APP)-$(VERSION)-$$os-$$arch$$ext . ; \
	done

docker:         ## Build the Docker image
	docker build --build-arg VERSION=$(VERSION) --build-arg BASE_PATH=$(BASE_PATH) -t $(APP):$(VERSION) -t $(APP):latest .

docker-run:     ## Run the Docker image on http://localhost:8080 (published on loopback only), data in ./data
	@mkdir -p data
	docker run --rm -p 127.0.0.1:8080:8080 -e CARDPRESS_INSECURE=1 -v $(PWD)/data:/data $(APP):latest

clean:
	rm -rf bin dist web/dist web/.astro   # data/ (your database) is left alone
