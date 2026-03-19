# .PHONY declares that these are not files.
# This prevents conflicts with files of the same name and improves performance.
.PHONY: clean tc lint format build build-dev build-fast build-firefox build-firefox-fast build-firefox-dev dev test unit ee package

# Cleans the project
cl:
	npm run clean

# Runs type-checking
tc:
	npm run typecheck

# Lints the code
lt:
	npm run lint

# Formats the code
ft:
	npm run format

# Runs a full production build with quality checks
bd:
	npm run build

# Runs a development build, skipping checks
bdd:
	npm run build:dev

# Runs a production build, skipping checks
bdf:
	npm run build:fast

# Runs a full production build for Firefox
bdff:
	npm run build:firefox

# Runs a production build for Firefox, skipping checks
bdfff:
	npm run build:firefox:fast

# Runs a development build for Firefox, skipping checks
bdffd:
	npm run build:firefox:dev

# Starts the development server with file watching
dev:
	npm run dev

# Runs all tests
tt:
	npm run test

# Runs unit tests
ut:
	npm run test:unit

# Runs end-to-end tests
ee:
	npm run test:e2e

# Creates a distributable package
pkg:
	npm run package