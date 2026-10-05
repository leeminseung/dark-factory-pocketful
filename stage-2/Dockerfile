# Pocketful service. No third-party packages: the image needs nothing at run time
# beyond Node itself, so it starts without network access.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/main.js"]
