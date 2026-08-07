# xtv — targets de desarrollo y verificación
SHELL := /bin/bash

.PHONY: all lint lint-sh lint-js test test-unit test-e2e fixtures dry-run test-app app clean

all: lint test

lint: lint-sh lint-js

lint-sh:
	@fail=0; \
	for f in emu/*.sh emu/experiments/*.sh test/smoke/*.sh; do \
		bash -n "$$f" || fail=1; \
	done; \
	if command -v shellcheck >/dev/null 2>&1; then \
		shellcheck -x emu/*.sh emu/experiments/*.sh test/smoke/*.sh || fail=1; \
	else \
		echo "shellcheck no disponible: solo bash -n (instálalo en el Mac: brew install shellcheck)"; \
	fi; \
	exit $$fail

lint-js:
	npx eslint .

fixtures:
	node test/fixtures/gen-clips.mjs

test: test-unit test-e2e

test-unit:
	node --test "test/unit/*.test.mjs"

test-e2e:
	node --test test/e2e/autoplay.spec.mjs

# Smokes ejecutables también en Linux (CI / esta sesión)
dry-run:
	bash test/smoke/bootstrap-dry.test.sh

test-app:
	bash test/smoke/make-app.test.sh

# Genera el bundle XTV.app real (macOS)
app:
	bash emu/make-app.sh

clean:
	rm -rf node_modules dist
