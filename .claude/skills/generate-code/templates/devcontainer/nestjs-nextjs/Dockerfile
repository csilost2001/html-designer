FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p public .next prisma
RUN npx prisma generate 2>/dev/null || true
RUN npm run build
RUN npx next build 2>/dev/null || true

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /build/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/.next ./.next
COPY --from=builder /build/public ./public
COPY --from=builder /build/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/main"]
