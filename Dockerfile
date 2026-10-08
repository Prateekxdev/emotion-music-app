FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci
COPY client ./client
COPY server ./server
RUN npm run build --workspace client

FROM node:20-alpine AS app
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/server/src ./server/src
COPY --from=build --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 5000
CMD ["npm", "run", "start", "--workspace", "server"]
