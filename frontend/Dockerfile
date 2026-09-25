# Keep in sync with frontend/.nvmrc, which pins the same major for CI.
FROM node:22-alpine AS builder
WORKDIR /app
# No glob on the lockfile: a missing one must fail the build, not silently
# fall back to resolving fresh. `npm ci` installs the locked tree exactly, so
# the image ships the versions CI tested rather than whatever satisfies the
# ranges on build day.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Passed through by compose; empty for a plain local build, in which case vite
# falls back to package.json.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
