FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV IQT_HOST=0.0.0.0 IQT_DATA_DIR=/data PORT=8787
EXPOSE 8787
CMD ["node","src/server.mjs"]
