FROM node:20-alpine AS backend-builder
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend ./
RUN npm run build

FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /build/backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=backend-builder /build/backend/dist ./dist
COPY --from=frontend-builder /build/frontend/.next ./frontend/.next
COPY --from=frontend-builder /build/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "dist/main"]
