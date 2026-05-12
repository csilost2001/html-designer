FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-17 AS backend-builder
WORKDIR /build
COPY pom.xml ./
COPY .mvn .mvn
COPY mvnw mvnw
RUN ./mvnw -B dependency:go-offline || mvn -B dependency:go-offline
COPY src ./src
RUN ./mvnw -B clean package -DskipTests || mvn -B clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=backend-builder /build/target/*.jar app.jar
COPY --from=frontend-builder /build/frontend/.next /app/frontend/.next
COPY --from=frontend-builder /build/frontend/public /app/frontend/public
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
