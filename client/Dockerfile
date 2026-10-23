FROM node:24-slim AS build

WORKDIR /app

COPY client/package*.json ./

RUN npm install --legacy-peer-deps

COPY client/. .

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
